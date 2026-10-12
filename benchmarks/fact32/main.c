/* Recursive 32-bit factorials of 0 to 15, eight times over. */

#include "bench.h"

volatile uint8_t fact_limit = 15;

uint32_t fact(uint8_t n)
{
	if (n > 1)
		return n * fact(n - 1);
	return 1;
}

int main(void)
{
	uint32_t sum = 0;
	uint8_t pass, n;

	bench_begin();
	for (pass = 0; pass < 8; pass++) {
		/* Read anew each pass, so no pass can be reused for the next. */
		uint8_t limit = fact_limit;
		for (n = 0; n <= limit; n++)
			sum += fact(n);
	}
	bench_end();
	bench_result = sum;
	bench_done();
	return 0;
}
