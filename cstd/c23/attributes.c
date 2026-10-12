/* Attributes */

/* An attribute the compiler does not know is ignored. */
[[z80bench::none]] static int value = 1;

int probe(void)
{
	return value;
}
