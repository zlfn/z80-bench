/* Anonymous structure/union initialization */

/* The anonymous union takes the first initializer as a whole, so c gets 2. */
static struct {
	union {
		int a;
		long b;
	};
	int c;
} s = { 1, 2 };

static union {
	struct {
		int a, b;
	};
	long c;
} u = { { 1, 2 } };

int probe(void)
{
	return s.a == 1 && s.c == 2 && u.a == 1 && u.b == 2;
}
