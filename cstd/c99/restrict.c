/* restrict pointers */

static int add(int *restrict a, int *restrict b)
{
	return *a + *b;
}

int probe(void)
{
	int a = 2, b = 3;

	return add(&a, &b) == 5;
}
