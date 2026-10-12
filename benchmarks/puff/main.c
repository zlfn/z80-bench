/* Inflates 4 KB of text with Mark Adler's puff. */

#include "bench.h"
#include "puff.h"

#define OUT_LEN 4096

static unsigned char out[OUT_LEN];

int main(void)
{
	unsigned long outlen = OUT_LEN;
	unsigned long inlen = bench_input_len;
	int err;

	bench_begin();
	err = puff(out, &outlen, bench_input, &inlen);
	bench_end();
	if (err || outlen != bench_output_len)
		bench_result = 0xFFFFFFFFul;
	else
		bench_result = bench_hash(out, OUT_LEN);
	bench_done();
	return 0;
}
