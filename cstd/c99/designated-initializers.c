/* Designated initializers */

struct point {
	int x, y, z;
};

static struct point p = { .z = 3, .x = 1 };
static int a[6] = { [4] = 9, [1] = 2 };

int probe(void)
{
	return p.x == 1 && p.y == 0 && p.z == 3 && a[1] == 2 && a[4] == 9 && a[5] == 0;
}
