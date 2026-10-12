/* Require support for variably modified types */

static int rows(int n, int (*m)[n])
{
	return (int)(sizeof m[0] / sizeof m[0][0]);
}

static int grid[2][3];

int probe(void)
{
	return rows(3, grid) == 3;
}
