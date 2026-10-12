/* Relax requirements for variadic parameter list */

#include <stdarg.h>

static int first(...)
{
	va_list ap;
	int v;

	va_start(ap);
	v = va_arg(ap, int);
	va_end(ap);
	return v;
}

int probe(void)
{
	return first(7, 8) == 7;
}
