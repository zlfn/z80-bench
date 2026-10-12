/* Decompresses 4 KB of text packed with ZX0 v2. */

#include "bench.h"

#define OUT_LEN 4096

static uint8_t out[OUT_LEN];

static const uint8_t *src;
static uint8_t last;   /* the byte read last */
static uint8_t bits;   /* the byte the bits come from */
static uint8_t mask;   /* the bit of it read next, 0 when used up */
static uint8_t reuse;  /* the next bit is bit 0 of last */

static uint8_t read_byte(void)
{
	last = *src++;
	return last;
}

static uint8_t read_bit(void)
{
	if (reuse) {
		reuse = 0;
		return last & 1;
	}
	mask >>= 1;
	if (!mask) {
		mask = 0x80;
		bits = read_byte();
	}
	return (bits & mask) != 0;
}

/* An interlaced Elias gamma code: each 0 bit is followed by the next bit of
 * the value, and a 1 bit ends it. */
static uint16_t read_gamma(uint8_t invert)
{
	uint16_t value = 1;

	while (!read_bit())
		value = (value << 1) | (read_bit() ^ invert);
	return value;
}

static uint8_t *copy(uint8_t *dst, uint16_t offset, uint16_t length)
{
	const uint8_t *from = dst - offset;

	while (length--)
		*dst++ = *from++;
	return dst;
}

static uint16_t dzx0(const uint8_t *input, uint8_t *output)
{
	uint8_t *dst = output;
	uint16_t offset = 1;
	uint16_t length;

	src = input;
	mask = 0;
	reuse = 0;
	for (;;) {
		length = read_gamma(0);
		while (length--)
			*dst++ = read_byte();
		if (!read_bit()) {
			/* A match at the last offset. */
			dst = copy(dst, offset, read_gamma(0));
			if (!read_bit())
				continue;
		}
		/* Matches at new offsets, for as long as the next bit is 1. */
		do {
			offset = read_gamma(1);
			if (offset == 256)
				return (uint16_t)(dst - output);
			offset = (offset << 7) - (read_byte() >> 1);
			reuse = 1;
			length = read_gamma(0) + 1;
			dst = copy(dst, offset, length);
		} while (read_bit());
	}
}

int main(void)
{
	uint16_t len;

	bench_begin();
	len = dzx0(bench_input, out);
	bench_end();
	if (len == bench_output_len)
		bench_result = bench_hash(out, OUT_LEN);
	else
		bench_result = 0xFFFFFFFF;
	bench_done();
	return 0;
}
