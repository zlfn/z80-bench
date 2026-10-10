/* The BYTE magazine sieve: a byte per odd number, 4 KB of flags. */

#include "bench.h"

#define SIZE 4096

static uint8_t flags[SIZE];

volatile uint16_t sieve_size = SIZE;

static uint16_t sieve(uint16_t size)
{
	uint16_t i, k, prime, count = 0;

	for (i = 0; i < size; i++)
		flags[i] = 1;
	for (i = 0; i < size; i++) {
		if (flags[i]) {
			prime = i + i + 3;
			for (k = i + prime; k < size; k += prime)
				flags[k] = 0;
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
