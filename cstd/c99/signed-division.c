/* Requiring truncation for divisions of signed integer types */

static int quot(int a, int b)
{
	return a / b;
}

static int rem(int a, int b)
{
	return a % b;
}

int probe(void)
{
	return quot(-7, 2) == -3 && rem(-7, 2) == -1 && quot(7, -2) == -3 && rem(7, -2) == 1;
}
