/* The harness alone. Its size is subtracted from every benchmark's, which
 * leaves out each toolchain's startup code and the markers. The runner also
 * builds it with fill.c or hash.c, calling what they hold, for the benchmarks
 * that use them. */

#include "bench.h"

#if defined(BENCH_FILL) || defined(BENCH_HASH)
static uint8_t buf[16];
#endif

int main(void)
{
#ifdef BENCH_FILL
	bench_fill(buf, sizeof buf);
#endif
	bench_begin();
	bench_end();
	bench_result = 0;
#ifdef BENCH_HASH
	bench_result = bench_hash(buf, sizeof buf);
#endif
	bench_done();
	return 0;
}
