/* Variably-modified (VM) types */

static int last(int n, int (*p)[n])
{
	return sizeof *p == n * sizeof(int) ? (*p)[n - 1] : -1;
}

static int a[4] = { 0, 1, 2, 3 };

int probe(void)
{
	return last(4, &a) == 3;
}
