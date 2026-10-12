/* Compound literals */

struct point {
	int x, y;
};

static int y_of(struct point p)
{
	return p.y;
}

int probe(void)
{
	int *a = (int[]){ 1, 2, 3 };

	return a[2] == 3 && y_of((struct point){ .y = 4 }) == 4;
}
