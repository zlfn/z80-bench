/* __has_c_attribute in preprocessor conditionals */

#ifndef __has_c_attribute
#error "no __has_c_attribute"
#endif

int probe(void)
{
#if __has_c_attribute(nodiscard) && !__has_c_attribute(z80bench_none)
	return 1;
#else
	return 0;
#endif
}
