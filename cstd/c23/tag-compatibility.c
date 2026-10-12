/* Improved tag compatibility */

struct point { int x, y; };
struct point { int x, y; };

int probe(void)
{
	struct point p = { 1, 2 };

	return p.y == 2;
}
