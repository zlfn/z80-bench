/* The BYTE sieve with a bit per odd number, 16000 bits, through helper functions. */

#include "bench.h"

#define SIZE 16000

static uint8_t flags[SIZE / 8 + 1];

static const uint8_t bit[8] = { 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80 };

volatile uint16_t sieve_size = SIZE;

uint8_t test_flag(uint16_t i)
{
	return flags[i >> 3] & bit[i & 7];
}

void clear_flag(uint16_t i)
{
	flags[i >> 3] &= (uint8_t)~bit[i & 7];
}

static uint16_t sieve(uint16_t size)
{
	uint16_t i, k, prime, count = 0;

	for (i = 0; i < size / 8 + 1; i++)
		flags[i] = 0xFF;
	for (i = 0; i < size; i++) {
		if (test_flag(i)) {
			prime = i + i + 3;
			for (k = i + prime; k < size; k += prime)
				clear_flag(k);
			count++;
		}
	}
	return count;
}

int main(void)
{
	uint16_t size = sieve_size;
	uint16_t count;

	bench_begin();
	count = sieve(size);
	bench_end();
	bench_result = count;
	bench_done();
	return 0;
}
