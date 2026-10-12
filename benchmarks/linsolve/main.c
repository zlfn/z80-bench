/* Gaussian elimination with partial pivoting on a 10 x 10 system of floats. */

#include "bench.h"

#define N 10

static float a[N][N + 1];

volatile uint16_t linsolve_seed = 12345;

int main(void)
{
	uint16_t s = linsolve_seed;
	uint8_t i, j, k, p;
	float f, check = 0.0f;

	/* Small integers, a heavier diagonal, and a right-hand side that makes
	 * the solution 1, 2, ..., N. */
	for (i = 0; i < N; i++) {
		a[i][N] = 0.0f;
		for (j = 0; j < N; j++) {
			s = s * 25173u + 13849u;
			a[i][j] = (float)(s >> 11) - 16.0f + (i == j ? 64.0f : 0.0f);
		}
		for (j = 0; j < N; j++)
			a[i][N] += a[i][j] * (j + 1);
	}

	bench_begin();
	for (k = 0; k < N; k++) {
		p = k;
		for (i = k + 1; i < N; i++) {
			float x = a[i][k] < 0.0f ? -a[i][k] : a[i][k];
			float y = a[p][k] < 0.0f ? -a[p][k] : a[p][k];
			if (x > y)
				p = i;
		}
		for (j = k; j <= N; j++) {
			f = a[k][j];
			a[k][j] = a[p][j];
			a[p][j] = f;
		}
		for (i = k + 1; i < N; i++) {
			f = a[i][k] / a[k][k];
			for (j = k; j <= N; j++)
				a[i][j] -= f * a[k][j];
		}
	}
	for (i = N; i-- > 0;) {
		f = a[i][N];
		for (j = i + 1; j < N; j++)
			f -= a[i][j] * a[j][N];
		a[i][N] = f / a[i][i];
	}
	bench_end();

	for (i = 0; i < N; i++)
		check += a[i][N] * (i + 1);
	bench_result = (uint32_t)(check * 100.0f + 0.5f);
	bench_done();
	return 0;
}
