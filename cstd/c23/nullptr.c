/* nullptr */

int probe(void)
{
	int *p = nullptr;

	return p == 0 && _Generic(nullptr, typeof(nullptr): 1, default: 0);
}
