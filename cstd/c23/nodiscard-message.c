/* [[nodiscard]] with message */

[[nodiscard("the result says whether it worked")]] static int one(void)
{
	return 1;
}

int probe(void)
{
	return one();
}
