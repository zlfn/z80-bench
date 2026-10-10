#!/bin/sh
# Usage: build-fcc.sh PREFIX
#
# Build the Fuzix Compiler Kit and the Fuzix Bintools it assembles and links
# with into PREFIX. The compiler finds its passes and libraries under PREFIX
# from then on, so the build cannot be moved.
set -eu

bintools=791db957f9fb451dfb0b7faf8a77aa435a75ed7b
compiler=7b2a72edea6967e7df0b32e1e898fdea1754cc67

prefix=$(mkdir -p "$1" && cd "$1" && pwd)
src=$(mktemp -d)
trap 'rm -rf "$src"' EXIT

git clone -q https://github.com/EtchedPixels/Fuzix-Bintools "$src/bintools"
git -C "$src/bintools" checkout -q "$bintools"
make -C "$src/bintools" -j"$(nproc)" CCROOT="$prefix/" >/dev/null
make -C "$src/bintools" CCROOT="$prefix/" install >/dev/null

git clone -q https://github.com/EtchedPixels/Fuzix-Compiler-Kit "$src/compiler"
git -C "$src/compiler" checkout -q "$compiler"
# The compiler's own build runs the bintools it just installed.
PATH="$prefix/bin:$PATH" make -C "$src/compiler" CCROOT="$prefix/" bootstuff >/dev/null
PATH="$prefix/bin:$PATH" make -C "$src/compiler" CCROOT="$prefix/" install >/dev/null
git -C "$src/compiler" log -1 --format='%h' > "$prefix/version"
