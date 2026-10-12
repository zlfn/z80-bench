/* Noreturn function specifier (_Noreturn, <stdnoreturn.h>) */

#include <stdnoreturn.h>

_Noreturn void z80bench_stop(void)
{
	for (;;)
		;
}

noreturn void z80bench_halt(void)
{
	z80bench_stop();
}

int probe(void)
{
	return 1;
}
