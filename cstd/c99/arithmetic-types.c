/* Enhanced arithmetic types */

#include <stdbool.h>
#include <stdint.h>

int probe(void)
{
	_Bool b = 5;
	bool t = true;
	long long ll = 1LL << 40;
	unsigned long long ull = 0xFFFFFFFFFFFFFFFFULL;
	int64_t s = -1;
	uint8_t u = 255;

	return b == 1 && t && (ll >> 40) == 1 && ull + 1 == 0 && s < 0
	    && (uint8_t)(u + 1) == 0 && sizeof(long long) * 8 >= 64;
}
