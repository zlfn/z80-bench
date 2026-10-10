/* The pi spigot, four digits at a time in 32-bit arithmetic: 160 digits. */

#include "bench.h"

#define TERMS 560
#define SCALE 10000
#define INIT 2000

static int32_t arr[TERMS + 1];

volatile uint16_t pi_terms = TERMS;

static uint32_t pi(uint16_t terms)
{
	uint32_t digits = 0;
	int32_t carry = 0;
	int32_t sum;
	uint16_t i, j;

	for (i = 0; i <= terms; i++)
		arr[i] = INIT;
	for (i = terms; i > 0; i -= 14) {
		sum = 0;
		for (j = i; j > 0; j--) {
			sum = sum * j + (int32_t)SCALE * arr[j];
			arr[j] = sum % (j * 2 - 1);
			sum /= j * 2 - 1;
		}
		/* Each group of four digits goes into a running hash. */
		digits = digits * 10007 + (uint32_t)(carry + sum / SCALE);
		carry = sum % SCALE;
	}
	return digits;
}

int main(void)
{
	uint16_t terms = pi_terms;
	uint32_t digits;

	bench_begin();
	digits = pi(terms);
	bench_end();
	bench_result = digits;
	bench_done();
	return 0;
}
