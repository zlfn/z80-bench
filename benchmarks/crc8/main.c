/* CRC-8/GSM-A, bit by bit, over 4 KB. */

#include "bench.h"

#define LEN 4096

static uint8_t buf[LEN];

static uint8_t crc8(const uint8_t *p, uint16_t len)
{
	uint8_t crc = 0;
	uint8_t i;

	while (len--) {
		crc ^= *p++;
		for (i = 0; i < 8; i++) {
			if (crc & 0x80)
				crc = (uint8_t)(crc << 1) ^ 0x1D;
			else
				crc <<= 1;
		}
	}
	return crc;
}

int main(void)
{
	uint8_t crc;

	bench_fill(buf, LEN);
	bench_begin();
	crc = crc8(buf, LEN);
	bench_end();
	bench_result = crc;
	bench_done();
	return 0;
}
