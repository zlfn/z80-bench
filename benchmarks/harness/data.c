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

uint32_t bench_hash(const uint8_t *buf, uint16_t len)
{
	uint32_t h = 5381;

	while (len--)
		h = (h << 5) + h + *buf++;
	return h;
}
