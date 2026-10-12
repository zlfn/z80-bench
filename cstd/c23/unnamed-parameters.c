/* Unnamed parameters in function definitions */

static int second(int, int b)
{
	return b;
}

int probe(void)
{
	return second(1, 2) == 2;
}
