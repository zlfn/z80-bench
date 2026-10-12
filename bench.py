#!/usr/bin/env python3
"""Build every benchmark with every compiler and count its cycles in z88dk-ticks.

Each run is checked against the result the same source produces on the host,
and sizes are given relative to the empty program built the same way, with
the same harness files, leaving out fixed input data.
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
import threading
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BENCHMARKS = ROOT / "benchmarks"
HARNESS = BENCHMARKS / "harness"
# Programs that show whether a compiler has a C language feature.
CSTD = ROOT / "cstd"
# llvm-z80 has no C library headers; these declare what its runtime provides.
LIBC_INCLUDE = ROOT / "toolchains" / "libc" / "include"
BUILD = ROOT / "build"
TICKS = ROOT / ".cache" / "bin" / "z88dk-ticks"
TARGETS = ("z80", "sm83")
PRESETS = ("speed", "size")
# Well above the slowest correct run here, gb-llvm's pi32 on the SM83. A program
# still running at this point never gets to where ticks is waiting, which
# counts as miscompiled.
CYCLE_LIMIT = 3_000_000_000
# ticks stops counting while the CPU sits in HALT, so a program that halts
# early never reaches the cycle limit. This wall-clock limit catches it.
TICKS_TIMEOUT = 120


class Failure(Exception):
    pass


class Hang(Failure):
    pass


def run(cmd, cwd=None, timeout=600, on_timeout=None) -> str:
    try:
        p = subprocess.run([str(c) for c in cmd], cwd=cwd, capture_output=True,
                           text=True, errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired:
        raise (on_timeout or Failure)(f"{Path(str(cmd[0])).name} timed out after {timeout}s")
    if p.returncode != 0:
        # zcc reports a crashed compiler as a plain failure with no output.
        msg = p.stderr.strip() or p.stdout.strip() or "no output"
        # A crash says why at the start, a link failure at the end.
        if len(msg) > 4000:
            msg = msg[:2000] + "\n...\n" + msg[-2000:]
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
    # "core" goes into the scores; "extended" is shown but kept out of them.
    tier: str
    # Bytes of fixed input data in its sources, which its size leaves out.
    input_size: int
    # Links the toolchain's floating-point library, where it has its own.
    math: bool = False
    # How far the result may stray from the host's, relative to it.
    tolerance: float = 0.0
    # The result to expect, when it is not the host's.
    expect: int | None = None
    # Sources that toolchains which preprocess for the compiler must give it
    # as they are: they test the compiler's own preprocessor.
    raw: list[Path] = dataclasses.field(default_factory=list)
    # For a C feature probe: its standard and the papers that brought it.
    standard: str = ""
    papers: dict[str, str] = dataclasses.field(default_factory=dict)

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
        input_size = sum(data_size(d / i) for i in conf.get("input", []))
        return cls(d.name, conf["description"], conf.get("origin", ""), conf.get("url", ""),
                   sources, include, conf.get("defines", []), conf.get("tier", "core"), input_size,
                   math=conf.get("math", False), tolerance=conf.get("tolerance", 0.0))

    @classmethod
    def probes(cls) -> list[Benchmark]:
        """The C feature probes in cstd/features.toml, leaving out the features
        checked manually or not at all. Each returns 1 when its feature works,
        so there is no host build to compare with."""
        out = []
        for f in tomllib.loads((CSTD / "features.toml").read_text())["feature"]:
            if "check" in f:
                continue
            src = CSTD / f["standard"].lower() / f"{f['name']}.c"
            out.append(cls(f"cstd-{f['standard'].lower()}-{f['name']}", f["desc"], "", "",
                           [CSTD / "main.c", src, HARNESS / "marker.c"], [src.parent, HARNESS],
                           [], "cstd", 0, expect=1, raw=[src], standard=f["standard"],
                           papers=f["papers"]))
        return out

    def cflags(self) -> list[str]:
        return [f"-I{i}" for i in self.include] + [f"-D{d}" for d in self.defines]

    def harness(self) -> tuple[str, ...]:
        """The harness files it links besides the markers, such as fill."""
        return tuple(sorted(s.stem for s in self.sources if s.parent == HARNESS and s.stem != "marker"))


def data_size(path: Path) -> int:
    """The bytes a generated input.c holds: its byte arrays and 16-bit values."""
    text = path.read_text()
    return (sum(int(n) for n in re.findall(r"uint8_t \w+\[(\d+)\]", text))
            + 2 * len(re.findall(r"uint16_t \w+ =", text)))


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
             *bench.cflags(), "-isystem", LIBC_INCLUDE, *bench.sources, "-o", elf])
        run([self.bindir / "llvm-objcopy", "-O", "binary", elf, image])
        return Program(image, elf_symbols(self.bindir / "llvm-nm", elf), image.stat().st_size)


class GbLlvm:
    """gb-llvm, an LLVM for the Game Boy only. Programs link with the runtime.S
    and compiler-rt its release ships, and nothing else, and enter at 0x100,
    as on the console."""

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
             *bench.cflags(), "-isystem", LIBC_INCLUDE, *bench.sources, self.bindir.parent / "runtime.S",
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
    """CE-Programming's ez80-clang in Z80 mode, used with z88dk the way z88dk
    uses it: with z88dk's headers, and with the routines z88dk has for it and
    its C library. CEdev's binutils assemble and link the program. z88dk's
    assembler then builds the library routines it calls into a block placed
    right after it, and the program is linked once more against that block."""

    def __init__(self, bindir: Path, image: str | None):
        if not image:
            sys.exit("ez80-clang needs the z88dk image for z88dk's library")
        self.bindir = bindir
        self.cedev = bindir.parent
        self.binutils = self.cedev / "binutils" / "bin"
        self.z88dk = Z88dk("sdcc", image)
        self.lock = threading.Lock()
        self.include = None

    def version(self) -> str:
        return f"{clang_version(self.bindir / 'ez80-clang')}, z88dk {self.z88dk.version()}"

    def z88dk_include(self) -> Path:
        """z88dk's headers, copied out of its image once."""
        with self.lock:
            if not self.include:
                dest = BUILD / "ez80-clang" / "z88dk-include"
                shutil.rmtree(dest, ignore_errors=True)
                dest.parent.mkdir(parents=True, exist_ok=True)
                run(self.z88dk.wrap(["cp", "-r", "/opt/z88dk/include", dest], ROOT))
                self.include = dest
            return self.include

    def link(self, objs: list[Path], elf: Path, extra: list = ()) -> dict[str, int]:
        run([self.binutils / "z80-none-elf-ld", "-T", ROOT / "toolchains" / "ez80-clang" / "z80.ld",
             "--gc-sections", "--no-warn-rwx-segments", *extra, *objs, "-o", elf])
        return elf_symbols(self.binutils / "z80-none-elf-nm", elf)

    def build(self, bench: Benchmark, target: str, flags: list[str], out: Path) -> Program:
        as_ = [self.binutils / "z80-none-elf-as", "-march=z80+xyhl"]
        include = self.z88dk_include()
        objs = [out / "crt0.o"]
        run([*as_, ROOT / "toolchains" / "ez80-clang" / "crt0.s", "-o", objs[0]])
        for i, src in enumerate(bench.sources):
            asm = out / f"{i}-{src.stem}.s"
            run([self.bindir / "ez80-clang", "--target=z80", *flags, "-ffreestanding", "-fno-addrsig",
                 "-mllvm", "-z80-gas-style", "-nostdinc", "-D__CLANG", "-D__Z88DK", "-D__Z80",
                 "-D__Z80__", *bench.cflags(), "-isystem", include, "-S", src, "-o", asm])
            objs.append(asm.with_suffix(".o"))
            run([*as_, asm, "-o", objs[-1]])

        # A first link leaves out the library, to see what the program calls
        # and where it ends.
        elf = out / "prog.elf"
        first = self.link(objs, elf, ["--unresolved-symbols=ignore-all"])
        nm = run([self.binutils / "z80-none-elf-nm", "-u", elf])
        calls = sorted({line.split()[-1] for line in nm.splitlines() if line.strip()})
        origin = first["__z88dk"]
        extra = []
        if calls:
            # Referenced from a section of its own, which z80asm writes to a
            # file of its own, so only the routines land in the block.
            (out / "rt.asm").write_text(
                "SECTION rt_refs\nORG $F000\n"
                + "".join(f"EXTERN {c}\ndefw {c}\n" for c in calls)
                + f"SECTION rt_code\nORG ${origin:04X}\n")
            lib = "/opt/z88dk/lib/clibs"
            run(self.z88dk.wrap(["z88dk-z80asm", "-mz80", "-b", "-m", f"-L{lib}", f"-L{lib}/z80",
                                 "-ltest_clib", "-lz80_crt0", "rt.asm"], out), cwd=out)
            run([self.binutils / "z80-none-elf-objcopy", "-I", "binary", "-O", "elf32-z80",
                 "--rename-section", ".data=.z88dk,alloc,load,contents,code",
                 out / "rt_rt_code.bin", out / "rt.o"])
            objs.append(out / "rt.o")
            routines = z88dk_symbols(out / "rt.map")
            extra = [f"--defsym={c}=0x{routines[c]:04x}" for c in calls]
        symbols = self.link(objs, elf, extra)
        if symbols["__z88dk"] != origin:
            raise Failure(f"z88dk's routines moved from {origin:#x} to {symbols['__z88dk']:#x}")
        image = out / "prog.bin"
        run([self.binutils / "z80-none-elf-objcopy", "-O", "binary", elf, image])
        return Program(image, symbols, image.stat().st_size)


class Fcc:
    """The Fuzix Compiler Kit in standalone mode, with no Fuzix libraries:
    programs link with our startup code and the kit's own support library.
    The build in bindir's parent is tied to its path by tools/build-fcc.sh."""

    def __init__(self, bindir: Path):
        self.bindir = bindir
        self.root = bindir.parent

    def version(self) -> str:
        return (self.root / "version").read_text().strip()

    def build(self, bench: Benchmark, target: str, flags: list[str], out: Path) -> Program:
        here = ROOT / "toolchains" / "fcc"
        env = ["env", f"PATH={self.bindir}:{os.environ['PATH']}"]
        objs = [out / "crt0.o"]
        run([*env, self.bindir / "asz80", "-o", objs[0], here / "crt0.s"])
        include = ["-I" + str(i) for i in (here / "include", self.root / "lib" / "z80" / "include",
                                            LIBC_INCLUDE)]
        for i, src in enumerate(bench.sources):
            # fcc keeps its intermediate files next to the source, so each job
            # compiles a copy of its own; quoted includes still find the original.
            copy = out / f"{i}-{src.name}"
            shutil.copyfile(src, copy)
            objs.append(copy.with_suffix(".o"))
            run([*env, self.bindir / "fcc", "-mz80", "-s", *flags, *bench.cflags(), *include,
                 f"-I{src.parent}", "-c", copy, "-o", objs[-1]], cwd=out)
        image = out / "prog.bin"
        run([*env, self.bindir / "ldz80", "-b", "-C", "0", "-m", out / "prog.map", "-o", image,
             *objs, self.root / "lib" / "z80" / "libz80.a"])
        symbols = {}
        for line in (out / "prog.map").read_text().splitlines():
            parts = line.split()
            if len(parts) == 3:
                symbols[parts[2]] = int(parts[0], 16)
        return Program(image, symbols, image.stat().st_size)


class Hitech:
    """HI-TECH C 3.09 for CP/M, run under the zxcc CP/M emulator that
    tools/build-hitech.sh builds. Programs are CP/M .com files with its own
    startup code and C library, which ticks runs as CP/M programs.

    Its compiler predates const and volatile, and CP/M file names are 8.3, so
    the host preprocessor flattens each source first with both keywords
    defined away. HI-TECH's own headers stand in for the system ones."""

    def __init__(self, bindir: Path):
        self.bindir = bindir
        self.cpm = bindir.parent / "lib" / "cpm"

    def zxcc(self, args: list, cwd: Path, made: Path) -> None:
        env = ["env", f"PATH={self.bindir}:{os.environ['PATH']}"]
        out = run([*env, self.bindir / "zxcc", "c.com", *args], cwd=cwd)
        # The driver exits 0 even when a pass fails, so look for its output.
        if not made.exists() or "undefined symbol" in out:
            raise Failure(out[-3000:])

    def version(self) -> str:
        # With no arguments the driver prints its banner and exits nonzero.
        p = subprocess.run(["env", f"PATH={self.bindir}:{os.environ['PATH']}",
                            str(self.bindir / "zxcc"), "c.com"], cwd=ROOT,
                           capture_output=True, text=True, stdin=subprocess.DEVNULL)
        m = re.search(r"V(\d+\.\d+\S*)", p.stdout)
        return m.group(1) if m else "unknown"

    def build(self, bench: Benchmark, target: str, flags: list[str], out: Path) -> Program:
        # zxcc passes an argument starting with "-" on without that dash.
        options = ["-" + f for f in flags]
        objs = []
        for i, src in enumerate(bench.sources):
            if src in bench.raw:
                shutil.copyfile(src, out / f"f{i}.c")
            else:
                run(["gcc", "-E", "-P", "-std=gnu89", "-undef", "-nostdinc", "-DCPM", "-DHI_TECH_C",
                     "-Dz80", "-Dconst=", "-Dvolatile=", f"-I{self.cpm / 'include80'}",
                     *bench.cflags(), f"-I{src.parent}", src, "-o", out / f"f{i}.c"])
            self.zxcc([*options, "--C", f"f{i}.c"], out, out / f"f{i}.obj")
            objs.append(f"f{i}.obj")
        # The program is named after the first object; LIBF has the floats.
        self.zxcc(["--Mprog.map", *objs, *(["--LF"] if bench.math else [])], out, out / "f0.com")
        image = out / "prog.com"
        (out / "f0.com").rename(image)
        symbols = {}
        for m in re.finditer(r"(\S+)\s+(?:text|data|bss|\(abs\))\s+([0-9A-F]{4})\b",
                             (out / "prog.map").read_text(errors="replace")):
            symbols[m.group(1)] = int(m.group(2), 16)
        # CP/M pads a .com file to whole 128-byte records; the map has the
        # exact end of text and initialized data.
        return Program(image, symbols, symbols["__Hdata"] - symbols["__Ltext"], entry=0x100)


class Uc80:
    """uc80 compiles every C file of a program in one go. The harness stays in
    translation units of its own, as it does for the other compilers, and a
    startup for bare memory replaces its CP/M one."""

    def __init__(self, bindir: Path):
        self.bindir = bindir

    def version(self) -> str:
        return run([self.bindir / "python", "-c",
                    "import importlib.metadata as m; print(m.version('uc80'))"]).strip()

    def build(self, bench: Benchmark, target: str, flags: list[str], out: Path) -> Program:
        uc80 = self.bindir / "uc80"
        lib = Path(run([uc80, "--print-lib-dir"]).strip())
        harness = [s for s in bench.sources if s.parent == HARNESS]
        program = [s for s in bench.sources if s not in harness]
        run([uc80, *flags, *bench.cflags(), "--startup-lib", ROOT / "toolchains" / "uc80" / "crt0.mac",
             *program, "-o", out / "prog.mac"])
        names = ["prog"]
        for src in harness:
            run([uc80, *flags, *bench.cflags(), "--no-whole-program", "--no-embed-startup",
                 "--no-embed-runtime", src, "-o", out / f"{src.stem}.mac"])
            names.append(src.stem)
        for name in names:
            run([self.bindir / "um80", out / f"{name}.mac", "-o", out / f"{name}.rel"])
        # A .com name makes ticks load the image at 100h, as CP/M would.
        image = out / "prog.bin"
        run([self.bindir / "ul80", "-p", "0", "-S", out / "prog.sym", "-o", image,
             *[out / f"{name}.rel" for name in names], lib / "libc.lib", lib / "runtime.lib"])
        symbols = {}
        for line in (out / "prog.sym").read_text().splitlines():
            parts = line.split()
            if len(parts) == 2:
                symbols[parts[1].lower()] = int(parts[0], 16)
        return Program(image, symbols, symbols["__bss_start"])


class Dcc:
    """dcc with the peephole optimizer, runtime stripper, assembler and linker
    it ships, built the way its own scripts build a program: one C file, run
    through dccpeep, then linked after the parts of its runtime it uses.
    Programs are CP/M .com files.

    M80 and L80 tell names apart by their first six characters, and every
    harness name starts with "bench_". So dcc compiles each program from one
    file that includes all of its sources, the harness among them, with the
    harness names renamed to differ early on."""

    RENAMES = {"bench_begin": "hbegin", "bench_end": "hend", "bench_done": "hdone",
               "bench_result": "hresult", "bench_fill": "hfill", "bench_hash": "hhash",
               "bench_input": "hinput", "bench_input_len": "hinlen", "bench_output_len": "houtlen"}

    def __init__(self, bindir: Path):
        self.bindir = bindir
        self.root = bindir.parent

    def version(self) -> str:
        return (self.root / "version").read_text().strip()

    @staticmethod
    def crlf(path: Path) -> None:
        # The assembler takes CP/M text files.
        path.write_bytes(path.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))

    def build(self, bench: Benchmark, target: str, flags: list[str], out: Path) -> Program:
        tool = lambda name: self.bindir / name
        (out / "prog.c").write_text("".join(f'#include "{s}"\n' for s in bench.sources))
        renames = [f"-D{c}={a}" for c, a in self.RENAMES.items()]
        run([tool("dcc"), "-I", self.root / "include", *bench.cflags(), *renames,
             out / "prog.c", "-o", out / "PROG.MAC"])
        # flags are dccpeep's: it is what optimizes for time or for size.
        run([tool("dccpeep"), *flags, out / "PROG.MAC", out / "PEEP.MAC"])
        (out / "PEEP.MAC").replace(out / "PROG.MAC")
        self.crlf(out / "PROG.MAC")
        run([tool("m80c"), "=PROG.MAC", "/X", "/O", "/Z", "/C"], cwd=out)
        shutil.copyfile(self.root / "DCCRTL.MAC", out / "DCCRTL.MAC")
        self.crlf(out / "DCCRTL.MAC")
        run([tool("dccrtlstrip"), "-r", out / "DCCRTL.MAC", "-o", out / "RTLMIN.MAC", out / "PROG.MAC"])
        self.crlf(out / "RTLMIN.MAC")
        run([tool("m80c"), "=RTLMIN.MAC", "/X", "/O", "/Z", "/C"], cwd=out)
        run([tool("l80c"), "/P:100,RTLMIN,PROG,PROG/N/E/Y"], cwd=out)

        # The link's symbols, cut to six characters; a module's own are
        # prefixed with its name.
        linked = {m[2]: int(m[1], 16) for m in re.finditer(r"([0-9A-F]{4}) ([^\s:]+)(?=\s)",
                                                           (out / "PROG.SYM").read_text(errors="replace"))}
        asm = (out / "PROG.MAC").read_text(errors="replace")
        symbols = {}
        for name, alias in self.RENAMES.items():
            short = f"_{alias}".upper()[:6]
            if short in linked:
                symbols[name] = linked[short]
            # Uninitialized data a single file keeps to itself is never made
            # public, only set to an offset in its block.
            elif m := re.search(rf"_{alias}\s+equ\s+__bssb\+(\d+)", asm):
                symbols[name] = linked["__BSSB"] + int(m[1])
        image = out / "prog.com"
        (out / "PROG.COM").replace(image)
        # The .com file is padded to whole 128-byte records; the program and
        # its data end where the uninitialized block begins.
        return Program(image, symbols, linked["__DATA"] - 0x100, entry=0x100)


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
        math = ["-lm"] if bench.math else []
        run(self.wrap(["zcc", "+test", *clib, f"-compiler={self.compiler}", *flags, "-vn", "-m",
                       *bench.cflags(), *bench.sources, *math, "-o", image], out), cwd=out)
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
    if bench.expect is not None:
        return bench.expect
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
    if abs(result - expect) > bench.tolerance * expect:
        return rec | {"status": "miscompiled", "error": f"result {result:#x}, expected {expect:#x}"}
    return rec | {"status": "ok", "cycles": cycles}


# Toolchains that take nothing but the directory of their binaries.
TOOLCHAINS = {"gb-llvm": GbLlvm, "fcc": Fcc, "hitech": Hitech,
              "uc80": Uc80, "dcc": Dcc}


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
    if kind == "ez80-clang":
        if not bindir:
            sys.exit(f"{name} needs --bin {name}=DIR")
        return Ez80Clang(Path(bindir), args.z88dk_image or None)
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
                        cells.append(f"{r['cycles']:,} {r.get('size', '?'):>6}")
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
    # The empty program once more for each set of harness files a benchmark
    # links, calling them, so that the harness drops out of every size.
    empty = next(b for b in benches if b.name == "empty")
    empties = {(): empty}
    for b in benches:
        h = b.harness()
        if h not in empties:
            empties[h] = dataclasses.replace(
                empty, name="-".join(("empty", *h)),
                sources=[*empty.sources, *(HARNESS / f"{n}.c" for n in h)],
                defines=[*empty.defines, *(f"BENCH_{n.upper()}" for n in h)])
    benches += [e for h, e in empties.items() if h]
    # The C feature probes run with -b cstd, or when no benchmark is named.
    probes = [b for b in Benchmark.probes()
              if not args.bench or "cstd" in args.bench or b.name in args.bench]

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
    expect = {b.name: expected_result(b) for b in benches + probes}

    # A compiler with no flags for a target does not support it.
    jobs = [(n, all_compilers[n].get(t, {}).get(p), b, t, p)
            for n in names for t in targets for p in presets for b in benches]
    # A probe is built once per compiler, for its first CPU and for speed,
    # with the option for the newest standard it has.
    for n in names:
        conf = all_compilers[n]
        t = next((t for t in targets if conf.get(t, {}).get("speed") is not None), None)
        if t and "speed" in presets and not conf.get("baseline"):
            jobs += [(n, [*conf[t]["speed"], *conf.get("std", [])], b, t, "speed") for b in probes]
    with cf.ThreadPoolExecutor(args.jobs) as pool:
        futures = [pool.submit(job, n, toolchains[n], flags, b, t, p, expect[b.name])
                   for n, flags, b, t, p in jobs]
        results = [f.result() for f in futures]

    by_name = {b.name: b for b in benches + probes}
    names_of_empties = {e.name for e in empties.values()}
    base_size = {(r["compiler"], r["target"], r["preset"], by_name[r["bench"]].harness()): r.get("size_total")
                 for r in results if r["bench"] in names_of_empties}
    for r in results:
        b = by_name[r["bench"]]
        base = base_size.get((r["compiler"], r["target"], r["preset"], b.harness()))
        if "size_total" in r and base is not None:
            r["size"] = r["size_total"] - base - b.input_size
    results = [r for r in results if r["bench"] not in names_of_empties]

    measured = [r for r in results if by_name[r["bench"]].tier != "cstd"]
    for r in measured:
        if r["status"] != "ok":
            print(f"{r['compiler']} {r['target']} {r['preset']} {r['bench']}: {r['status']}"
                  + (f"\n  {r['error'][:500]}" if "error" in r else ""), file=sys.stderr)
    print_table(measured, names)
    if probes:
        print("\nC features that work:")
        for n in names:
            done = [r for r in results if r["compiler"] == n and by_name[r["bench"]].tier == "cstd"]
            if done:
                print(f"  {n:12} {sum(r['status'] == 'ok' for r in done)}/{len(done)}")

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
                "nightly": all_compilers[n].get("nightly", False),
                "flags": {t: all_compilers[n][t] for t in TARGETS if t in all_compilers[n]},
            } for n in names},
            "benchmarks": {b.name: {
                "description": b.description,
                "origin": b.origin,
                "url": b.url,
                "tier": b.tier,
                "scored": b.tier == "core",
                **({"standard": b.standard, "papers": b.papers} if b.standard else {}),
            } for b in benches + probes if b.name not in names_of_empties},
            "results": results,
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(doc, indent=1) + "\n")


if __name__ == "__main__":
    main()
