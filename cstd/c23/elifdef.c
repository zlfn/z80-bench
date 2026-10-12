/* #elifdef and #elifndef */

#define DEFINED

#ifdef UNDEFINED
#elifdef DEFINED
#define FIRST 1
#endif

#ifdef UNDEFINED
#elifndef ALSO_UNDEFINED
#define SECOND 1
#endif

#if !defined(FIRST) || !defined(SECOND)
#error "no #elifdef or #elifndef"
#endif

int probe(void)
{
	return 1;
}
