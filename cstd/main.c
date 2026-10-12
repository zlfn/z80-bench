/* Runs one feature probe. Its result is 1 when the feature works. */

#include "bench.h"

int probe(void);

int main(void)
{
	int ok;

	bench_begin();
	ok = probe();
	bench_end();
	bench_result = ok;
	bench_done();
	return 0;
}
