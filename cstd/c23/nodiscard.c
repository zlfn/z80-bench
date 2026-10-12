/* [[nodiscard]] */

[[nodiscard]] static int one(void)
{
	return 1;
}

int probe(void)
{
	return one();
}
