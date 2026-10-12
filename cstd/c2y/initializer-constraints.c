/* Slay Some Earthly Demons VIII */

/* A structure is initialized from one of a compatible type, and an array
 * from a plain string literal only if its elements are characters. The file
 * must build as it is, and give a diagnostic with each -DCASE=n. */

struct point {
	int x, y;
};

struct other {
	int x, y;
};

#ifndef CASE
static char text[] = { "fine" };

int copy(void)
{
	struct point a = { 1, 2 };
	struct point b = a;

	return b.y + text[0];
}
#elif CASE == 1
int mismatch(void)
{
	struct other o = { 1, 2 };
	struct point p = o;

	return p.x;
}
#elif CASE == 2
static int numbers[] = "nope";
#endif
