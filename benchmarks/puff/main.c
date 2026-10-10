/* Inflates 4 KB of text with Mark Adler's puff. */

#include "bench.h"
#include "puff.h"

#define OUT_LEN 4096

extern const uint16_t puff_input_len;
extern const uint16_t puff_output_len;
extern const unsigned char puff_input[];

static unsigned char out[OUT_LEN];

int main(void)
{
	unsigned long outlen = OUT_LEN;
	unsigned long inlen = puff_input_len;
	int err;

	bench_begin();
	err = puff(out, &outlen, puff_input, &inlen);
	bench_end();
	if (err || outlen != puff_output_len)
		bench_result = 0xFFFFFFFFul;
	else
		bench_result = bench_hash(out, OUT_LEN);
	bench_done();
	return 0;
}
