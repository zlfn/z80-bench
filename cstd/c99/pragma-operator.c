/* _Pragma preprocessor operator */

#define PRAGMA(x) _Pragma(#x)

PRAGMA(STDC FP_CONTRACT ON)

int probe(void)
{
	return 1;
}
