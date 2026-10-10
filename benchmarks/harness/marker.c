/* Kept in a translation unit of its own so no compiler can inline the markers
 * away. Each one stores something different: zsdcc gives two empty functions
 * the same address, and then the runner cannot tell them apart. */

#include "bench.h"

#ifdef BENCH_HOST
#include <stdio.h>
#endif

volatile uint32_t bench_result;

static volatile uint8_t bench_phase;

void bench_begin(void)
{
	bench_phase = 1;
}

void bench_end(void)
{
	bench_phase = 2;
}

void bench_done(void)
{
	bench_phase = 3;
#ifdef BENCH_HOST
	/* The host build gives the runner the result to expect. */
	printf("%lu\n", (unsigned long)bench_result);
#endif
}
