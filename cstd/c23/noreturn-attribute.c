/* [[noreturn]] */

[[noreturn]] void z80bench_stop(void)
{
	for (;;)
		;
}

int probe(void)
{
	return 1;
}
