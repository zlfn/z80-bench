/* stdcbench port for z80-bench. See portme.h for the clock.
 *
 * The score stdcbench computes comes from that synthetic clock, so it is the
 * same on every toolchain and says nothing about speed. It is still a useful
 * result to check: it is only right if every round ran. */

#include "bench.h"
#include "stdcbench.h"

static uint8_t failed;
static stdcbench_clock_t elapsed;

void stdcbench_error(const char *message)
{
	(void)message;
	failed = 1;
}

stdcbench_clock_t stdcbench_clock(void)
{
	stdcbench_clock_t now = elapsed;
	/* Rounded up: a truncated step would leave the last round just short
	 * of the threshold and run one more. */
	elapsed += (STDCBENCH_C90BASE_UNITS + STDCBENCH_ITERATIONS - 1)
	           / STDCBENCH_ITERATIONS;
	return now;
}

int main(void)
{
	unsigned long score;

	failed = 0;
	elapsed = 0;

	bench_begin();
	score = stdcbench();
	bench_end();
	bench_result = failed ? 0xFFFFFFFFul : score;
	bench_done();
	return 0;
}
