/* Slay Some Earthly Demons XVI */

/* The value of an lvalue with an incomplete type other than an array is
 * never needed, though its address can be. The file must build as it is, and
 * give a diagnostic with each -DCASE=n. */

struct opaque;
extern struct opaque *p;

#ifndef CASE
struct opaque *same(void)
{
	return &*p;
}
#elif CASE == 1
void value(void)
{
	(void)*p;
}
#endif
