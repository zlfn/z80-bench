/* [[maybe_unused]] */

[[maybe_unused]] static int spare(void)
{
	return 0;
}

int probe(void)
{
	[[maybe_unused]] int unused = 2;

	return 1;
}
