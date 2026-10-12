/* What every benchmark shares with the runner.
 *
 * The runner counts cycles from the entry of bench_begin to the entry of
 * bench_end. In a second run it stops at bench_done and reads bench_result
 * out of a RAM dump, to compare with what the same source gives on the host. */

#ifndef BENCH_H
#define BENCH_H

#include <stdint.h>

void bench_begin(void);
void bench_end(void);
void bench_done(void);

extern volatile uint32_t bench_result;

/* From fill.c and hash.c, which a benchmark lists among its sources when it
 * uses them. */

/* Input the compiler cannot know: bytes from a generator seeded by a
 * volatile, so no kernel can be folded at compile time. */
void bench_fill(uint8_t *buf, uint16_t len);

/* Folds a buffer into the result after the timed region. */
uint32_t bench_hash(const uint8_t *buf, uint16_t len);

/* From the input.c of a benchmark that decodes a fixed input, which the runner
 * leaves out of its size. */
extern const uint16_t bench_input_len;
extern const uint16_t bench_output_len;
extern const uint8_t bench_input[];

#endif
