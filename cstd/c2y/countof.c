/* _Countof operator */

int probe(void)
{
	int a[7];
	int m[2][3];

	return _Countof(a) == 7 && _Countof(m) == 2 && _Countof(m[0]) == 3;
}
