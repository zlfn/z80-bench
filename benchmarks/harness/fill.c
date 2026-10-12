#include "bench.h"

volatile uint16_t bench_seed = 0xACE1;

void bench_fill(uint8_t *buf, uint16_t len)
{
	uint16_t x = bench_seed;

	while (len--) {
		/* xorshift16 */
		x ^= x << 7;
		x ^= x >> 9;
		x ^= x << 8;
		*buf++ = (uint8_t)x;
	}
}
