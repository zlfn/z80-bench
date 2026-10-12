#include "bench.h"

/* Fletcher's two sums, in 8- and 16-bit operations so that it calls no 32-bit
 * runtime routine a benchmark might share. */
uint32_t bench_hash(const uint8_t *buf, uint16_t len)
{
	uint16_t a = 0, b = 0;
	uint32_t h;
	uint8_t *p = (uint8_t *)&h;

	while (len--) {
		a += *buf++;
		b += a;
	}
	/* Little-endian, as are the host and both targets. */
	p[0] = (uint8_t)a;
	p[1] = (uint8_t)(a >> 8);
	p[2] = (uint8_t)b;
	p[3] = (uint8_t)(b >> 8);
	return h;
}
