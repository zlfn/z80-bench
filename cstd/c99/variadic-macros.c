/* Variadic macros */

#define FIRST(x, ...) x
#define LIST(...) { __VA_ARGS__ }

int probe(void)
{
	int a[] = LIST(1, 2, 3);

	return FIRST(4, 5, 6) == 4 && sizeof a == 3 * sizeof(int);
}
