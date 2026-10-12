/* The Mandelbrot set in single-precision floats: escape counts over a grid. */

#include "bench.h"

#define W 32
#define H 24

volatile uint8_t mandel_iter = 24;

int main(void)
{
	uint8_t iter = mandel_iter;
	uint16_t total = 0;
	uint8_t x, y, i;

	bench_begin();
	for (y = 0; y < H; y++) {
		float ci = -1.2f + y * (2.4f / H);
		for (x = 0; x < W; x++) {
			float cr = -2.1f + x * (3.0f / W);
			float zr = 0.0f, zi = 0.0f;
			for (i = 0; i < iter; i++) {
				float zr2 = zr * zr, zi2 = zi * zi;
				if (zr2 + zi2 > 4.0f)
					break;
				zi = 2.0f * zr * zi + ci;
				zr = zr2 - zi2 + cr;
			}
			total += i;
		}
	}
	bench_end();
	bench_result = total;
	bench_done();
	return 0;
}
