/* Alignment support (_Alignas, _Alignof, <stdalign.h>) */

#include <stdalign.h>

static _Alignas(4) char buf[4];
static alignas(int) char small;

int probe(void)
{
	return _Alignof(char) == 1 && alignof(int) >= 1 && (unsigned)(unsigned long)buf % 4 == 0
	    && sizeof small == 1;
}
