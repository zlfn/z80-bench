/* The harness alone. Its size is subtracted from every benchmark's, which
 * leaves out each toolchain's startup code and the markers. */

#include "bench.h"

int main(void)
{
	bench_begin();
	bench_end();
	bench_result = 0;
	bench_done();
	return 0;
}
