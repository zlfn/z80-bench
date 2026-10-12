/* [[unsequenced]] and [[reproducible]] */

static int square(int x) [[unsequenced]];
static int same(int x) [[reproducible]];

static int square(int x)
{
	return x * x;
}

static int same(int x)
{
	return x;
}

int probe(void)
{
	return square(3) + same(1) == 10;
}
