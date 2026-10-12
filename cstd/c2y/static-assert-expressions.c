/* static_assert expressions */

#define TWICE(n) (static_assert((n) < 100), (n) * 2)

/* The assertion is an expression of type void, not a call to some function. */
int probe(void)
{
	return TWICE(21) == 42 && _Generic(static_assert(1), void: 1, default: 0);
}
