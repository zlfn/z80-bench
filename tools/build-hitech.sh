#!/bin/sh
# Usage: build-hitech.sh PREFIX
#
# Build the zxcc CP/M emulator into PREFIX and put HI-TECH C 3.09 where it
# looks for CP/M programs, libraries and headers (PREFIX/lib/cpm). zxcc's
# generated build files lag its sources, so they are regenerated, which needs
# automake.
set -eu

zxcc=c45e5065eca63dd045d60511a8b21ab7f567303a
hitech=v3.09-21

prefix=$(mkdir -p "$1" && cd "$1" && pwd)
src=$(mktemp -d)
trap 'rm -rf "$src"' EXIT

git clone -q https://github.com/agn453/ZXCC "$src/zxcc"
git -C "$src/zxcc" checkout -q "$zxcc"
(cd "$src/zxcc" && sh ./update-configure.sh && ./configure --prefix="$prefix" --with-filetracker &&
	make -j"$(nproc)" && make install) >/dev/null 2>&1

git -c advice.detachedHead=false clone -q --depth 1 --branch "$hitech" https://github.com/agn453/HI-TECH-Z80-C "$src/hitech"
dist=$src/hitech/dist
cpm=$prefix/lib/cpm
# zxcc looks CP/M names up in lower case; the driver is C309-21.COM.
for f in "$dist"/*.COM; do cp "$f" "$cpm/bin80/$(basename "$f" | tr A-Z a-z)"; done
cp "$dist/C309-21.COM" "$cpm/bin80/c.com"
for f in "$dist"/*.LIB "$dist"/*.OBJ; do cp "$f" "$cpm/lib80/$(basename "$f" | tr A-Z a-z)"; done
for f in "$dist"/*.H; do cp "$f" "$cpm/include80/$(basename "$f" | tr A-Z a-z)"; done
