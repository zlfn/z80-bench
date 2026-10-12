/* Slay Some Earthly Demons XVII */

/* va_start belongs in a function with a variable argument list. The file
 * must build as it is, and give a diagnostic with each -DCASE=n. */

#include <stdarg.h>

int sum(int n, ...)
{
	va_list ap;
	int total = 0;

	va_start(ap, n);
	while (n--)
		total += va_arg(ap, int);
	va_end(ap);
	return total;
}

#if CASE == 1
int fixed(int n)
{
	va_list ap;

	va_start(ap, n);
	va_end(ap);
	return n;
}
#endif
