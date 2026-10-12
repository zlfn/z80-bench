/* Static assertions (_Static_assert) */

_Static_assert(sizeof(char) == 1, "char is one byte");

int probe(void)
{
	_Static_assert(1 + 1 == 2, "arithmetic");
	return 1;
}
