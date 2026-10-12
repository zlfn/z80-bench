/* static_assert with no message */

_Static_assert(sizeof(int) >= 2);

int probe(void)
{
	return 1;
}
