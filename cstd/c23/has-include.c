/* __has_include in preprocessor conditionals */

#ifndef __has_include
#error "no __has_include"
#endif

int probe(void)
{
#if __has_include(<stddef.h>) && !__has_include("z80bench-missing.h")
	return 1;
#else
	return 0;
#endif
}
