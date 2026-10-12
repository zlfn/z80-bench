/* __VA_OPT__ */

#define SUM(x, ...) (x __VA_OPT__(+ __VA_ARGS__))

int probe(void)
{
	return SUM(1) == 1 && SUM(1, 2) == 3;
}
