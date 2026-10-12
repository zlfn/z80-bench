/* Empty initializers */

struct point {
	int x, y;
};

int probe(void)
{
	int a[3] = {};
	struct point p = {};
	int n = {};

	return a[2] == 0 && p.y == 0 && n == 0;
}
