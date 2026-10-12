/* Member access of an incomplete object */

/* The left side of . and -> has a complete type, so a structure cannot reach
 * into itself while it is still being defined. The file must build as it is,
 * and give a diagnostic with each -DCASE=n. */

struct done {
	int a;
	int b;
};

#ifndef CASE
struct sized {
	int y : sizeof ((struct done *)0)->a * 8;
};
#elif CASE == 1
struct self {
	int a;
	int x : sizeof ((struct self *)0)->a * 8;
};
#endif
