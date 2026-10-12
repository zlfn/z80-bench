/* static_assert without UB */

/* A static assertion takes an integer constant expression and anything else
 * is a constraint violation, even an expression whose value is known. The
 * file must build as it is, and give a diagnostic with each -DCASE=n. */

extern int a;

#ifndef CASE
_Static_assert(1, "fine");
#elif CASE == 1
_Static_assert(1 || a, "not an integer constant expression");
#endif
