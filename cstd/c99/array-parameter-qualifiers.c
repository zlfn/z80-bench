/* Cvr-qualifiers and static in [] within function declarations */

static int sum(int a[static 3], int b[const 2])
{
	return a[0] + a[2] + b[1];
}

int probe(void)
{
	int a[3] = { 1, 2, 3 }, b[2] = { 4, 5 };

	return sum(a, b) == 9;
}
