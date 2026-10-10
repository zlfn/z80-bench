#!/bin/sh
# Usage: build-sdcc.sh SOURCE_DIR PREFIX
#
# Build SDCC from a checkout of the llvm-z80/sdcc mirror with only the Z80
# and SM83 ports, and install it into PREFIX. ChangeLog's $Revision$ is filled
# from the mirror's git-svn-id trailers, as SVN would, so sdcc --version
# numbers a trunk build the way an SVN checkout does.
set -eu

src=$(cd "$1" && pwd)
prefix=$2
cd "$src"

# The last commit to change ChangeLog is what SVN puts in its $Revision$.
rev=$(git log -1 --first-parent --format='%(trailers:key=git-svn-id,valueonly)' -- ChangeLog |
	sed -nE 's/.*@([0-9]+) .*/\1/p')
if [ -n "$rev" ]; then
	sed -i "s/^\\\$Revision\\\$\$/\$Revision: $rev \$/" ChangeLog
fi

ports=$(./configure --help | grep -oE -- '--disable-[a-z0-9_]+-port' | sort -u |
	grep -vE -- '--disable-(z80|sm83)-port')
# shellcheck disable=SC2086
./configure --prefix="$prefix" --disable-non-free --disable-ucsim --disable-sdcdb $ports
make -j"$(nproc)"
make install
