#!/usr/bin/env python3
"""Build every benchmark with every compiler and count its cycles in z88dk-ticks.

Each run is checked against the result the same source produces on the host,
and sizes are given relative to the empty program built the same way.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import dataclasses
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BENCHMARKS = ROOT / "benchmarks"
HARNESS = BENCHMARKS / "harness"
# llvm-z80 has no C library headers; these declare what its runtime provides.
LLVM_INCLUDE = ROOT / "toolchains" / "llvm-z80" / "include"
BUILD = ROOT / "build"
TICKS = ROOT / ".cache" / "bin" / "z88dk-ticks"
TARGETS = ("z80", "sm83")
PRESETS = ("speed", "size")
# About five times the slowest correct run here. A program still running at
# this point never gets to where ticks is waiting, which counts as miscompiled.
CYCLE_LIMIT = 2_000_000_000
# ticks stops counting while the CPU sits in HALT, so a program that halts
# early never reaches the cycle limit. This wall-clock limit catches it.
TICKS_TIMEOUT = 120


class Failure(Exception):
    pass


class Hang(Failure):
    pass


def run(cmd, cwd=None, timeout=3600, on_timeout=None) -> str:
    try:
        p = subprocess.run([str(c) for c in cmd], cwd=cwd, capture_output=True,
                           text=True, errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired:
        raise (on_timeout or Failure)(f"{Path(str(cmd[0])).name} timed out after {timeout}s")
    if p.returncode != 0:
        # zcc reports a crashed compiler as a plain failure with no output.
        msg = (p.stderr.strip() or p.stdout.strip())[-3000:] or "no output"
        raise Failure(f"{Path(str(cmd[0])).name} exited {p.returncode}: {msg}")
    return p.stdout


@dataclasses.dataclass
class Benchmark:
    name: str
    description: str
    origin: str
    url: str
    sources: list[Path]
    include: list[Path]
    defines: list[str]
    # Dhrystone is shown but kept out of scores.
    scored: bool

    @classmethod
    def load(cls, d: Path) -> Benchmark:
        conf = tomllib.loads((d / "bench.toml").read_text())
        sources = []
        for pattern in conf["sources"]:
            found = sorted(glob.glob(str(d / pattern)))
            if not found:
                sys.exit(f"{d.name}: nothing matches {pattern}")
            sources += [Path(f).resolve() for f in found]
        sources.append(HARNESS / "marker.c")
        include = [(d / i).resolve() for i in conf["include"]] + [HARNESS]
        return cls(d.name, conf["description"], conf.get("origin", ""), conf.get("url", ""),
                   sources, include, conf.get("defines", []), conf.get("scored", True))

    def cflags(self) -> list[str]:
        return [f"-I{i}" for i in self.include] + [f"-D{d}" for d in self.defines]


@dataclasses.dataclass
class Program:
    image: Path
    symbols: dict[str, int]
    # Code and initialized data, startup code included.
    size: int
    # Where execution starts, when it is not at address 0.
    entry: int = 0

    def address(self, name: str) -> int:
        for s in (name, "_" + name):
            if s in self.symbols:
                return self.symbols[s]
        raise Failure(f"{name} is not in the link map")


def clang_version(clang: Path) -> str:
    line = run([clang, "--version"]).splitlines()[0]
    m = re.search(r"clang version (\S+)(?: \(\S+ ([0-9a-f]{12}))?", line)
    return " ".join(g for g in m.groups() if g) if m else line


def elf_symbols(nm: Path, elf: Path) -> dict[str, int]:
    symbols = {}
    for line in run([nm, elf]).splitlines():
        parts = line.split()
        if len(parts) == 3:
            symbols[parts[2]] = int(parts[0], 16)
    return symbols


class Llvm:
    def __init__(self, bindir: Path):
        self.bindir = bindir

    def version(self) -> str:
        return clang_version(self.bindir / "clang")

    def build(self, bench: Benchmark, target: str, flags: list[str], out: Path) -> Program:
        elf = out / "prog.elf"
        image = out / "prog.bin"
        run([self.bindir / "clang", f"--target={target}", *flags, "-ffreestanding",
             *bench.cflags(), "-isystem", LLVM_INCLUDE, *bench.sources, "-o", elf])
        run([self.bindir / "llvm-objcopy", "-O", "binary", elf, image])
        return Program(image, elf_symbols(self.bindir / "llvm-nm", elf), image.stat().st_size)


class GbLlvm:
    """gb-llvm, an LLVM for the Game Boy only. Programs link with the runtime.S
    its release ships and with our string functions and runtime fixes, and
    enter at 0x100, as on the console."""

    def __init__(self, bindir: Path):
        self.bindir = bindir

    def version(self) -> str:
        return clang_version(self.bindir / "clang")

    def build(self, bench: Benchmark, target: str, flags: list[str], out: Path) -> Program:
        elf = out / "prog.elf"
        image = out / "prog.bin"
        # The release's ld.lld needs a libxml2 and an ICU newer than some systems
        # have; CI puts them in the release's lib/.
        lib = self.bindir.parent / "lib"
        env = ["env", f"LD_LIBRARY_PATH={lib}:{os.environ.get('LD_LIBRARY_PATH', '')}"]
        run([*env, self.bindir / "clang", "--target=gb-unknown-unknown", *flags, "-ffreestanding",
             *bench.cflags(), "-isystem", LLVM_INCLUDE, *bench.sources,
             ROOT / "toolchains" / "libc" / "string.c", ROOT / "toolchains" / "gb-llvm" / "runtime.c",
             self.bindir.parent / "runtime.S",
             "-T", ROOT / "toolchains" / "gb-llvm" / "gb.ld",
             "-o", elf])
        run([self.bindir / "llvm-objcopy", "-O", "binary", elf, image])
        # The image has holes, the cartridge header among them; count sections.
        size = 0
        for line in run([self.bindir / "llvm-readelf", "-S", "-W", elf]).splitlines():
            m = re.match(r"\s*\[\s*\d+\]\s+(\S+)\s+(\S+)\s+\S+\s+\S+\s+(\S+)\s+\S+\s+(\S*A\S*)\s", line)
            if m and m.group(2) != "NOBITS":
                size += int(m.group(3), 16)
        return Program(image, elf_symbols(self.bindir / "llvm-nm", elf), size, entry=0x100)


class Ez80Clang:
    """CE-Programming's ez80-clang in Z80 mode, with the binutils CEdev ships.
    CEdev's runtime and C library are for ADL mode only, so programs link
    with ours."""

    def __init__(self, bindir: Path):
        self.bindir = bindir
        self.cedev = bindir.parent
        self.binutils = self.cedev / "binutils" / "bin"

    def version(self) -> str:
        return clang_version(self.bindir / "ez80-clang")

    def build(self, bench: Benchmark, target: str, flags: list[str], out: Path) -> Program:
        here = ROOT / "toolchains" / "ez80-clang"
        as_ = [self.binutils / "z80-none-elf-as", "-march=z80+xyhl"]
        objs = []
        sources = [(s, []) for s in bench.sources]
        sources.append((ROOT / "toolchains" / "libc" / "string.c", ["-ffunction-sections"]))
        for i, (src, extra) in enumerate(sources):
            asm = out / f"{i}-{src.stem}.s"
            run([self.bindir / "ez80-clang", "--target=z80", *flags, *extra, "-ffreestanding",
                 "-fno-addrsig", "-mllvm", "-z80-gas-style", "-nostdinc", *bench.cflags(),
                 "-isystem", self.cedev / "include", "-S", src, "-o", asm])
            objs.append(asm.with_suffix(".o"))
            run([*as_, asm, "-o", objs[-1]])
        for name in ("crt0", "runtime"):
            objs.append(out / f"{name}.o")
            run([*as_, here / f"{name}.s", "-o", objs[-1]])
        elf = out / "prog.elf"
        image = out / "prog.bin"
        run([self.binutils / "z80-none-elf-ld", "-T", here / "z80.ld", "--gc-sections", "--no-warn-rwx-segments",
             *objs, "-o", elf])
        run([self.binutils / "z80-none-elf-objcopy", "-O", "binary", elf, image])
        return Program(image, elf_symbols(self.binutils / "z80-none-elf-nm", elf),
                       image.stat().st_size)


class Uc80:
    """uc80 compiles every C file of a program in one go. The markers stay in
    a translation unit of their own, as they do for the other compilers, and
    a startup for bare memory replaces its CP/M one."""

    def __init__(self, bindir: Path):
        self.bindir = bindir

    def version(self) -> str:
        return run([self.bindir / "python", "-c",
                    "import importlib.metadata as m; print(m.version('uc80'))"]).strip()

    def build(self, bench: Benchmark, target: str, flags: list[str], out: Path) -> Program:
        uc80 = self.bindir / "uc80"
        lib = Path(run([uc80, "--print-lib-dir"]).strip())
        marker = HARNESS / "marker.c"
        program = [s for s in bench.sources if s != marker]
        run([uc80, *flags, *bench.cflags(), "--startup-lib", ROOT / "toolchains" / "uc80" / "crt0.mac",
             *program, "-o", out / "prog.mac"])
        run([uc80, *flags, *bench.cflags(), "--no-whole-program", "--no-embed-startup",
             "--no-embed-runtime", marker, "-o", out / "marker.mac"])
        for name in ("prog", "marker"):
            run([self.bindir / "um80", out / f"{name}.mac", "-o", out / f"{name}.rel"])
        # A .com name makes ticks load the image at 100h, as CP/M would.
        image = out / "prog.bin"
        run([self.bindir / "ul80", "-p", "0", "-S", out / "prog.sym", "-o", image,
             out / "prog.rel", out / "marker.rel", lib / "libc.lib", lib / "runtime.lib"])
        symbols = {}
        for line in (out / "prog.sym").read_text().splitlines():
            parts = line.split()
            if len(parts) == 2:
                symbols[parts[1].lower()] = int(parts[0], 16)
        return Program(image, symbols, symbols["__bss_start"])


class Sdcc:
    def __init__(self, bindir: Path | None):
        self.bindir = bindir

    def tool(self, name: str):
        return self.bindir / name if self.bindir else name

    def version(self) -> str:
        line = run([self.tool("sdcc"), "--version"]).splitlines()[0]
        m = re.search(r"\d+\.\d+\.\d+ #\d+", line)
        return m.group(0) if m else line

    def build(self, bench: Benchmark, target: str, flags: list[str], out: Path) -> Program:
        cpu = f"-m{target}"
        rels = []
        for n, src in enumerate(bench.sources):
            rel = out / f"{n:02}_{src.stem}.rel"
            run([self.tool("sdcc"), cpu, *flags, *bench.cflags(), "-c", src, "-o", rel])
            rels.append(rel)
        ihx = out / "prog.ihx"
        image = out / "prog.bin"
        run([self.tool("sdcc"), cpu, *rels, "-o", ihx])
        run([self.tool("makebin"), "-s", "65536", ihx, image])
        return Program(image, sdld_symbols(out / "prog.map"), ihx_bytes(ihx))


def sdld_symbols(path: Path) -> dict[str, int]:
    symbols = {}
    for line in path.read_text(errors="replace").splitlines():
        m = re.match(r"\s+([0-9A-F]{8})\s+(\S+)", line)
        if m:
            symbols[m.group(2)] = int(m.group(1), 16)
    return symbols


def ihx_bytes(path: Path) -> int:
    total = 0
    for line in path.read_text().splitlines():
        if line.startswith(":") and line[7:9] == "00":
            total += int(line[1:3], 16)
    return total


class Z88dk:
    """zcc for one of its compilers, run from a z88dk image unless image is None."""

    def __init__(self, compiler: str, image: str | None):
        self.compiler = compiler
        self.image = image

    def wrap(self, cmd: list, cwd: Path) -> list:
        if not self.image:
            return cmd
        return ["docker", "run", "--rm", "-u", f"{os.getuid()}:{os.getgid()}",
                "-v", f"{ROOT}:{ROOT}", "-w", str(cwd), self.image, *cmd]

    def version(self) -> str:
        p = subprocess.run([str(c) for c in self.wrap(["zcc"], ROOT)],
                           capture_output=True, text=True)
        m = re.search(r"z88dk Cross-C Compiler - (\S+)", p.stdout + p.stderr)
        return m.group(1) if m else "unknown"

    def build(self, bench: Benchmark, target: str, flags: list[str], out: Path) -> Program:
        clib = ["-clib=gbz80"] if target == "sm83" else []
        image = out / "prog.bin"
        run(self.wrap(["zcc", "+test", *clib, f"-compiler={self.compiler}", *flags, "-vn", "-m",
                       *bench.cflags(), *bench.sources, "-o", image], out), cwd=out)
        symbols = z88dk_symbols(out / "prog.map")
        # +test images carry .bss as well; it starts where the loaded data ends.
        return Program(image, symbols, symbols["__BSS_head"] - symbols["__head"])


def z88dk_symbols(path: Path) -> dict[str, int]:
    symbols = {}
    for line in path.read_text(errors="replace").splitlines():
        m = re.match(r"(\S+)\s+=\s+\$([0-9A-F]+)\s*;", line)
        if m:
            symbols[m.group(1)] = int(m.group(2), 16)
    return symbols


def ticks(prog: Program, target: str, args: list) -> int:
    cpu = ["-mgbz80"] if target == "sm83" else []
    entry = ["-pc", f"{prog.entry:x}"] if prog.entry else []
    stdout = run([TICKS, *cpu, *entry, *args, "-counter", CYCLE_LIMIT, prog.image],
                 timeout=TICKS_TIMEOUT, on_timeout=Hang)
    last = stdout.strip().splitlines()[-1]
    if "counter limit" in last:
        raise Hang(f"still running after {CYCLE_LIMIT:,} cycles")
    return int(last)


def measure(prog: Program, target: str, out: Path) -> tuple[int, int]:
    """Cycles from bench_begin to bench_end, and the result at bench_done.

    ticks stops at the address that ends its count, so a result that is only
    known after the timed region takes a second run. The result run goes
    first: its count starts at reset, so the cycle limit catches a program
    that hangs, while a count started at bench_begin never runs out if the
    program hangs before getting there.
    """
    dump = out / "ram.bin"
    # ticks restarts its count whenever pc reaches -start, which is 0 unless
    # given, and gb-llvm calls through address 0. Pointing -start at the end
    # keeps the count, and with it the cycle limit, running from reset.
    done = f"{prog.address('bench_done'):x}"
    ticks(prog, target, ["-start", done, "-end", done, "-output", dump])
    at = prog.address("bench_result")
    result = int.from_bytes(dump.read_bytes()[at:at + 4], "little")
    cycles = ticks(prog, target, ["-start", f"{prog.address('bench_begin'):x}",
                                  "-end", f"{prog.address('bench_end'):x}"])
    return cycles, result


def expected_result(bench: Benchmark) -> int:
    out = BUILD / "host" / bench.name
    out.mkdir(parents=True, exist_ok=True)
    exe = out / "host"
    run(["cc", "-O1", "-DBENCH_HOST", "-w", *bench.cflags(), *bench.sources, "-o", exe])
    return int(run([exe]).strip().splitlines()[-1])


def job(compiler: str, toolchain, flags: list[str], bench: Benchmark,
        target: str, preset: str, expect: int) -> dict:
    out = BUILD / compiler / target / preset / bench.name
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    rec = {"bench": bench.name, "compiler": compiler, "target": target, "preset": preset}
    if flags is None:
        return rec | {"status": "unsupported"}
    try:
        prog = toolchain.build(bench, target, flags, out)
    except Failure as e:
        return rec | {"status": "build-failed", "error": str(e)}
    rec["size_total"] = prog.size
    try:
        cycles, result = measure(prog, target, out)
    except Hang as e:
        return rec | {"status": "miscompiled", "error": str(e)}
    except Failure as e:
        return rec | {"status": "run-failed", "error": str(e)}
    if result != expect:
        return rec | {"status": "miscompiled", "error": f"result {result:#x}, expected {expect:#x}"}
    return rec | {"status": "ok", "cycles": cycles}


# Toolchains that take nothing but the directory of their binaries.
TOOLCHAINS = {"gb-llvm": GbLlvm, "ez80-clang": Ez80Clang, "uc80": Uc80}


def make_toolchain(name: str, conf: dict, args):
    kind = conf["toolchain"]
    bindir = args.bin.get(name)
    if kind == "llvm":
        bindir = bindir or args.llvm_bin
        if not bindir:
            sys.exit(f"{name} needs --bin {name}=DIR, --llvm-bin or LLVM_Z80_BIN")
        return Llvm(Path(bindir))
    if kind == "sdcc":
        # --sdcc-bin is the pinned release; a build of trunk is named explicitly.
        if conf.get("release"):
            bindir = bindir or args.sdcc_bin
        elif not bindir:
            sys.exit(f"{name} needs --bin {name}=DIR with an SDCC trunk build")
        return Sdcc(Path(bindir) if bindir else None)
    if kind == "z88dk":
        return Z88dk(conf["zcc-compiler"], args.z88dk_image or None)
    if kind in TOOLCHAINS:
        if not bindir:
            sys.exit(f"{name} needs --bin {name}=DIR")
        return TOOLCHAINS[kind](Path(bindir))
    sys.exit(f"unknown toolchain {kind}")


def print_table(results: list[dict], compilers: list[str]):
    for target in TARGETS:
        for preset in PRESETS:
            rows = [r for r in results if r["target"] == target and r["preset"] == preset]
            if not rows:
                continue
            print(f"\n{target} / {preset}   (cycles, bytes over the empty program)")
            benches = sorted({r["bench"] for r in rows})
            print(f"{'':12}" + "".join(f"{c:>24}" for c in compilers))
            for b in benches:
                cells = []
                for c in compilers:
                    r = next((r for r in rows if r["bench"] == b and r["compiler"] == c), None)
                    if r is None:
                        cells.append("")
                    elif r["status"] == "ok":
                        cells.append(f"{r['cycles']:,} {r['size']:>6}")
                    else:
                        cells.append(r["status"])
                print(f"{b:12}" + "".join(f"{x:>24}" for x in cells))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("-c", "--compiler", action="append", help="compiler from compilers.toml")
    ap.add_argument("-t", "--target", action="append", choices=TARGETS)
    ap.add_argument("-p", "--preset", action="append", choices=PRESETS)
    ap.add_argument("-b", "--bench", action="append", help="benchmark directory name")
    ap.add_argument("--llvm-bin", default=os.environ.get("LLVM_Z80_BIN"),
                    help="directory with llvm-z80's clang (default: $LLVM_Z80_BIN)")
    ap.add_argument("--sdcc-bin", default=os.environ.get("SDCC_BIN"),
                    help="directory with the pinned SDCC release (default: $SDCC_BIN, else PATH)")
    ap.add_argument("--z88dk-image", default=os.environ.get("Z88DK_IMAGE", "z88dk/z88dk:latest"),
                    help="docker image for zcc; empty to run zcc from PATH")
    ap.add_argument("--bin", action="append", default=[], metavar="NAME=DIR",
                    help="where one compiler's binaries are, over --llvm-bin and --sdcc-bin")
    ap.add_argument("--versions", action="store_true",
                    help="print the compilers' versions as JSON and stop")
    ap.add_argument("-j", "--jobs", type=int, default=os.cpu_count())
    ap.add_argument("-o", "--output", type=Path, help="write the results here as JSON")
    args = ap.parse_args()
    # Absolute, since some of these end up as docker mounts.
    args.bin = {n: str(Path(d).resolve()) for n, d in (b.split("=", 1) for b in args.bin)}

    all_compilers = tomllib.loads((ROOT / "compilers.toml").read_text())
    names = args.compiler or list(all_compilers)
    for n in names:
        if n not in all_compilers:
            sys.exit(f"unknown compiler {n}")
    targets = args.target or list(TARGETS)
    presets = args.preset or list(PRESETS)
    bench_dirs = sorted(d for d in BENCHMARKS.iterdir() if (d / "bench.toml").exists())
    benches = [Benchmark.load(d) for d in bench_dirs
               if d.name == "empty" or not args.bench or d.name in args.bench]

    toolchains = {n: make_toolchain(n, all_compilers[n], args) for n in names}
    versions = {n: toolchains[n].version() for n in names}
    for n in names:
        release = all_compilers[n].get("release")
        if release and not versions[n].startswith(release + " "):
            sys.exit(f"{n} is pinned to {release}, found {versions[n]}")
    if args.versions:
        print(json.dumps(versions, indent=1))
        return

    subprocess.run([ROOT / "tools" / "build-ticks.sh"], check=True)
    expect = {b.name: expected_result(b) for b in benches}

    with cf.ThreadPoolExecutor(args.jobs) as pool:
        # A compiler with no flags for a target does not support it.
        futures = [pool.submit(job, n, toolchains[n], all_compilers[n].get(t, {}).get(p), b, t, p, expect[b.name])
                   for n in names for t in targets for p in presets for b in benches]
        results = [f.result() for f in futures]

    empty = {(r["compiler"], r["target"], r["preset"]): r.get("size_total")
             for r in results if r["bench"] == "empty"}
    for r in results:
        base = empty.get((r["compiler"], r["target"], r["preset"]))
        if "size_total" in r and base is not None:
            r["size"] = r["size_total"] - base
    results = [r for r in results if r["bench"] != "empty"]

    for r in results:
        if r["status"] != "ok":
            print(f"{r['compiler']} {r['target']} {r['preset']} {r['bench']}: {r['status']}"
                  + (f"\n  {r['error'][:500]}" if "error" in r else ""), file=sys.stderr)
    print_table(results, names)

    if args.output:
        commit = subprocess.run(["git", "-C", ROOT, "rev-parse", "HEAD"],
                                capture_output=True, text=True).stdout.strip()
        doc = {
            "commit": commit,
            "ticks": {
                "commit": (ROOT / "tools" / "ticks.commit").read_text().strip(),
                "patches": sorted(p.name for p in (ROOT / "tools" / "ticks-patches").glob("*.patch")),
            },
            "compilers": {n: {
                "version": versions[n],
                "baseline": all_compilers[n].get("baseline", False),
                "flags": {t: all_compilers[n][t] for t in TARGETS if t in all_compilers[n]},
            } for n in names},
            "benchmarks": {b.name: {
                "description": b.description,
                "origin": b.origin,
                "url": b.url,
                "scored": b.scored,
            } for b in benches if b.name != "empty"},
            "results": results,
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(doc, indent=1) + "\n")


if __name__ == "__main__":
    main()
