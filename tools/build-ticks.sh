#!/bin/sh
# Build z88dk-ticks from the z88dk commit in tools/ticks.commit, with any
# fixes in tools/ticks-patches/ that upstream has not merged yet.
#
# Every cycle count on the site comes from this one emulator, so it is pinned
# separately from the z88dk compilers under test. Moving the pin changes past
# numbers too and means measuring everything again.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
commit=$(cat "$root/tools/ticks.commit")
src="$root/.cache/z88dk-ticks-src"
out="$root/.cache/bin/z88dk-ticks"
patches=$(ls "$root"/tools/ticks-patches/*.patch 2>/dev/null || true)
stamp=$(cat "$root/tools/ticks.commit" $patches | sha256sum | cut -d' ' -f1)

if [ -x "$out" ] && [ "$(cat "$out.stamp" 2>/dev/null)" = "$stamp" ]; then
	exit 0
fi

if [ ! -d "$src/.git" ]; then
	git clone -q --filter=blob:none --no-checkout https://github.com/z88dk/z88dk "$src"
	git -C "$src" sparse-checkout set src/ticks src/common ext/uthash
fi
git -C "$src" fetch -q origin "$commit"
git -C "$src" checkout -q -f "$commit"
for patch in $patches; do
	git -C "$src" apply "$patch"
done
# ticks includes uthash.h from this submodule, not from the system.
git -C "$src" submodule update -q --init ext/uthash

make -C "$src/src/ticks" -j"$(nproc)" z88dk-ticks >/dev/null
mkdir -p "$(dirname "$out")"
cp "$src/src/ticks/z88dk-ticks" "$out"
echo "$stamp" > "$out.stamp"
