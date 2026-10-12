#!/bin/sh
# Usage: build-dcc.sh PREFIX
#
# Build dcc and the tools it ships with into PREFIX/bin: its peephole
# optimizer, its runtime stripper and its M80 and L80 clones. The runtime,
# DCCRTL.MAC, and the headers go next to them.
set -eu

commit=c98156fe9492a3f0a14cb3c6be1e10d3860860da

prefix=$(mkdir -p "$1" && cd "$1" && pwd)
src=$(mktemp -d)
trap 'rm -rf "$src"' EXIT

git clone -q https://github.com/davidly/dcc "$src/dcc"
git -C "$src/dcc" checkout -q "$commit"
(cd "$src/dcc" && sh m-posix.sh -NoStatic >/dev/null)
mkdir -p "$prefix/bin" "$prefix/include"
for tool in dcc dccpeep dccrtlstrip m80c l80c; do
    cp "$src/dcc/$tool" "$prefix/bin/"
done
cp "$src/dcc/DCCRTL.MAC" "$prefix/"
cp "$src/dcc"/*.h "$prefix/include/"
git -C "$src/dcc" log -1 --format='%h' > "$prefix/version"
