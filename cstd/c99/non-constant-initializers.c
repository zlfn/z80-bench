/* Non-constant initializers */

static int id(int x)
{
	return x;
}

int probe(void)
{
	int v = id(3);
	int a[2] = { v, v + 1 };
	struct {
		int p, q;
	} s = { id(5), v };

	return a[1] == 4 && s.p == 5 && s.q == 3;
}
