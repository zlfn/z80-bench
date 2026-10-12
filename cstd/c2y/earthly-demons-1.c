/* Slay Some Earthly Demons I */

/* Four kinds of declaration became constraint violations. The file must
 * build as it is, and give a diagnostic with each -DCASE=n. The paper's
 * fifth change, register arrays decaying to pointers, became
 * implementation-defined and is not checked. */

struct later;

#ifndef CASE
/* An inline definition, an alignment on a definition only, and a function
 * declared extern in a block. */
inline int twice(int x)
{
	return 2 * x;
}

_Alignas(int) int aligned = 1;
extern int aligned;

int user(void)
{
	extern int helper(void);

	return 0;
}
#elif CASE == 1
/* An object with no linkage and an incomplete type. */
void incomplete(void)
{
	struct later x;
}
#elif CASE == 2
/* A function declared static in a block. */
void block_static(void)
{
	static void hidden(void);
}
#elif CASE == 3
/* An inline function with external linkage that is never defined. */
inline void never_defined(void);
#elif CASE == 4
/* An alignment on a declaration of an object whose definition has none. */
int plain = 1;
extern _Alignas(int) int plain;
#endif
