/* inline functions */

static inline int square(int x)
{
	return x * x;
}

inline int cube(int x)
{
	return x * x * x;
}

extern int cube(int x);

int probe(void)
{
	return square(3) == 9 && cube(2) == 8;
}
