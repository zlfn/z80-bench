/* Declarations and statements in mixed order */

int probe(void)
{
	int a = 1;
	a += 2;
	int b = a * 2;
	return b == 6;
}
