/* Allow calling static inline within extern inline */

/* An inline definition of a function with external linkage may now use names
 * with internal linkage, so none of this may be diagnosed. */

static int counter;

static inline void bump(void)
{
	counter++;
}

inline int step(void)
{
	bump();
	return counter;
}
