/* CRC-32/BZIP2 (MSB first, no table), bit by bit, over 4 KB. */

#include "bench.h"

#define LEN 4096

static uint8_t buf[LEN];

static uint32_t crc32(const uint8_t *p, uint16_t len)
{
	uint32_t crc = 0xFFFFFFFFul;
	uint8_t i;

	while (len--) {
		crc ^= (uint32_t)*p++ << 24;
		for (i = 0; i < 8; i++) {
			if (crc & 0x80000000ul)
				crc = (crc << 1) ^ 0x04C11DB7ul;
			else
				crc <<= 1;
		}
	}
	return crc ^ 0xFFFFFFFFul;
}

int main(void)
{
	uint32_t crc;

	bench_fill(buf, LEN);
	bench_begin();
	crc = crc32(buf, LEN);
	bench_end();
	bench_result = crc;
	bench_done();
	return 0;
}
