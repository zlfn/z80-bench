#!/usr/bin/env python3
"""Add a bench.py result to the site's data.

The full result goes to site/data/runs/<id>.json. site/data/index.json lists
every run with its summary scores, which is all the history chart needs. The
benchmark sources, with every header they include, go under site/src/ for the
source viewer, listed in site/data/sources.json. compilers-info.toml and the
benchmark descriptions go to site/data/compilers.json and benchmarks.json.

A compiler's score for one target, preset and metric is the geometric mean,
over the scored benchmarks it and the baseline compiler both passed, of its
value divided by the baseline's. The baseline scores 1.0.

The history chart plots absolute values instead: the score times the
geometric mean of the baseline's values. That is the compiler's own geometric
mean when it passed everything, and counts a missing benchmark as being as
fast as the others.
"""

import argparse
import datetime
import json
import math
import os
import re
import shutil
import sys
import tomllib
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "site" / "data"
SRC = ROOT / "site" / "src"

sys.path.insert(0, str(ROOT))
from bench import BENCHMARKS, Benchmark  # noqa: E402
METRICS = {"cycles": "cycles", "size": "size"}


def summarize(run: dict) -> dict:
    scored = [b for b, v in run["benchmarks"].items() if v["scored"]]
    results = {(r["compiler"], r["target"], r["preset"], r["bench"]): r for r in run["results"]}
    compilers = list(run["compilers"])
    baseline = next(c for c, v in run["compilers"].items() if v.get("baseline"))
    ok = lambda c, t, p, b: results.get((c, t, p, b), {}).get("status") == "ok"
    targets = sorted({r["target"] for r in run["results"]})
    presets = sorted({r["preset"] for r in run["results"]})
    out = {}
    for t in targets:
        for p in presets:
            for metric, key in METRICS.items():
                base = {b: results[(baseline, t, p, b)][key] for b in scored if ok(baseline, t, p, b)}
                base_mean = math.exp(sum(math.log(v) for v in base.values()) / len(base))
                scores = {}
                for c in compilers:
                    if not any(r["compiler"] == c and r["target"] == t and r["status"] != "unsupported"
                               for r in run["results"]):
                        continue
                    logs = [math.log(results[(c, t, p, b)][key] / base[b]) for b in base
                            if ok(c, t, p, b)]
                    score = math.exp(sum(logs) / len(logs)) if logs else None
                    scores[c] = {
                        "score": round(score, 4) if logs else None,
                        "value": round(score * base_mean) if logs else None,
                        "passed": sum(ok(c, t, p, b) for b in scored),
                        "total": len(scored),
                    }
                out.setdefault(t, {}).setdefault(p, {})[metric] = scores
    return out


def included(path: Path, include: list[Path]) -> list[Path]:
    """The headers a file includes, as found in its own directory or the
    benchmark's include path. System headers are not found and drop out."""
    found = []
    for name in re.findall(r'^\s*#\s*include\s*[<"]([^>"]+)[>"]', path.read_text(errors="replace"), re.M):
        for d in [path.parent, *include]:
            if (d / name).is_file():
                found.append((d / name).resolve())
                break
    return found


def copy_sources() -> dict:
    shutil.rmtree(SRC, ignore_errors=True)
    listing = {}
    for d in sorted(BENCHMARKS.iterdir()):
        if not (d / "bench.toml").exists() or d.name == "empty":
            continue
        bench = Benchmark.load(d)
        files, todo = [], list(bench.sources)
        while todo:
            f = todo.pop(0)
            if f in files:
                continue
            files.append(f)
            todo += included(f, bench.include)
        # The benchmark's own files first, then what it borrows, the harness last.
        rank = lambda f: 2 if f.is_relative_to(BENCHMARKS / "harness") else 0 if f.is_relative_to(d) else 1
        rel = [f.relative_to(ROOT).as_posix() for f in sorted(files, key=rank)]
        for r in rel:
            (SRC / r).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / r, SRC / r)
        listing[d.name] = rel
    return listing


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("result", type=Path, nargs="?", help="JSON written by bench.py -o")
    ap.add_argument("--id", default=datetime.date.today().isoformat(),
                    help="run id, the date of the run by default")
    ap.add_argument("--assets-only", action="store_true",
                    help="only write the sources and descriptions, not a run")
    args = ap.parse_args()
    if args.assets_only:
        write_assets()
        return
    if not args.result:
        ap.error("a result file is needed unless --assets-only")

    run = json.loads(args.result.read_text())
    run["id"] = args.id
    # Compiler messages carry local paths and are not shown on the site.
    for r in run["results"]:
        r.pop("error", None)
    (DATA / "runs").mkdir(parents=True, exist_ok=True)
    (DATA / "runs" / f"{args.id}.json").write_text(json.dumps(run, separators=(",", ":")) + "\n")

    index_path = DATA / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {"runs": []}
    index["runs"] = [r for r in index["runs"] if r["id"] != args.id]
    index["runs"].append({
        "id": args.id,
        "commit": run.get("commit", ""),
        "versions": {c: v["version"] for c, v in run["compilers"].items()},
        "summary": summarize(run),
    })
    index["runs"].sort(key=lambda r: r["id"])
    index["latest"] = index["runs"][-1]["id"]
    index_path.write_text(json.dumps(index, indent=1) + "\n")
    write_assets()


def last_commit(repo: str, branch: str | None, path: str | None) -> str | None:
    """The date of the last commit to a GitHub repository, branch and path, or
    None if GitHub cannot be reached. GH_TOKEN raises the API rate limit."""
    query = urllib.parse.urlencode({k: v for k, v in (("sha", branch), ("path", path)) if v}
                                   | {"per_page": 1})
    req = urllib.request.Request(f"https://api.github.com/repos/{repo}/commits?{query}",
                                 headers={"Accept": "application/vnd.github+json"})
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)[0]["commit"]["committer"]["date"][:10]
    except (OSError, ValueError, LookupError) as e:
        print(f"warning: no last commit for {repo}: {e}", file=sys.stderr)
        return None


def write_assets():
    """What the site shows besides the runs, taken from the current sources."""
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "sources.json").write_text(json.dumps(copy_sources(), indent=1) + "\n")
    info = tomllib.loads((ROOT / "compilers-info.toml").read_text())
    # When GitHub cannot be reached, keep the dates the last publish found.
    try:
        before = json.loads((DATA / "compilers.json").read_text())
    except (OSError, ValueError):
        before = {}
    for name, about in info.items():
        if "repo" in about:
            date = last_commit(about["repo"], about.get("branch"), about.get("path"))
            date = date or before.get(name, {}).get("last_commit")
            if date:
                about["last_commit"] = date
    (DATA / "compilers.json").write_text(json.dumps(info, indent=1) + "\n")
    benches = {}
    for d in sorted(BENCHMARKS.iterdir()):
        if (d / "bench.toml").exists() and d.name != "empty":
            conf = tomllib.loads((d / "bench.toml").read_text())
            benches[d.name] = {k: conf.get(k, "") for k in ("description", "details", "origin", "url")}
    (DATA / "benchmarks.json").write_text(json.dumps(benches, indent=1) + "\n")


if __name__ == "__main__":
    main()
