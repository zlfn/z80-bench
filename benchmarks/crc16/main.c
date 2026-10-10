/* CRC-16/XMODEM, bit by bit, over 4 KB. */

#include "bench.h"

#define LEN 4096

static uint8_t buf[LEN];

static uint16_t crc16(const uint8_t *p, uint16_t len)
{
	uint16_t crc = 0;
	uint8_t i;

	while (len--) {
		crc ^= (uint16_t)*p++ << 8;
		for (i = 0; i < 8; i++) {
			if (crc & 0x8000)
				crc = (uint16_t)(crc << 1) ^ 0x1021;
			else
				crc <<= 1;
		}
	}
	return crc;
}

int main(void)
{
	uint16_t crc;

	bench_fill(buf, LEN);
	bench_begin();
	crc = crc16(buf, LEN);
	bench_end();
	bench_result = crc;
	bench_done();
	return 0;
}
