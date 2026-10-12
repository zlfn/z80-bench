/* Variable-length array (VLA) types */

static int fill(int n)
{
	int a[n];
	int i;

	for (i = 0; i < n; i++)
		a[i] = i;
	return sizeof a == n * sizeof(int) && a[n - 1] == n - 1;
}

int probe(void)
{
	return fill(5) && fill(9);
}
