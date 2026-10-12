/* Generic selection (_Generic) */

#define KIND(x) _Generic((x), int: 1, long: 2, char *: 3, default: 0)

int probe(void)
{
	return KIND(1) == 1 && KIND(1L) == 2 && KIND("a") == 3 && KIND(1.0) == 0;
}
