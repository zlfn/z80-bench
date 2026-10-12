/* Composite types */

/* A conditional expression may not give a pointer to an array whose length
 * is evaluated only with an operand that is not. These are the examples from
 * the paper, with 0 for nullptr. The file must build as it is, and give a
 * diagnostic with each -DCASE=n. */

#ifndef CASE
void fine(int cond, void *p1, void *p2)
{
	int n = 2;
	int m = 3;
	char (*a)[3] = cond ? (char (*)[3])p1 : (char (*)[m])p2;
	char (*b)[cond ? n : m] = cond ? (char (*)[n])p1 : (char (*)[m])p2;
	char (*p3)[] = p1;
	char (*p4)[m] = p2;
	char (*c)[m] = cond ? 0 : p4;
	char (*d)[m] = cond ? p3 : p4;

	(void)a;
	(void)b;
	(void)c;
	(void)d;
}
#elif CASE == 1
void null(int cond, void *p1)
{
	int n = 2;

	(void)(cond ? 0 : (char (*)[n])p1);
}
#elif CASE == 2
void unknown(int cond, void *p1, void *p2)
{
	int n = 2;

	(void)(cond ? (char (*)[])p1 : (char (*)[n])p2);
}
#endif
