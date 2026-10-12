/* Earthly Demon: Accessing a Member of an Atomic Structure or Union */

/* The members of an atomic structure are reached through a copy that is not
 * atomic, not with . or ->. The file must build as it is, and give a
 * diagnostic with each -DCASE=n. */

struct pair {
	int x, y;
};

static _Atomic struct pair shared;

#ifndef CASE
int copy(void)
{
	struct pair p = shared;

	return p.x + p.y;
}
#elif CASE == 1
int member(void)
{
	return shared.x;
}
#elif CASE == 2
int arrow(void)
{
	_Atomic struct pair *p = &shared;

	return p->y;
}
#endif
