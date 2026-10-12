/* Slay Some Earthly Demons IX */

/* A tentative definition with internal linkage needs a complete type by the
 * end of the file. The file must build as it is, and give a diagnostic with
 * each -DCASE=n. */

#ifndef CASE
struct later;
static struct later completed;

struct later {
	int x;
};

int get(void)
{
	return completed.x;
}
#elif CASE == 1
struct never;
static struct never incomplete;
#endif
