/* typeof and typeof_unqual */

int probe(void)
{
	typeof(1 + 1) a = 3;
	typeof_unqual(const int) b = 4;

	b = 5;
	return a + b == 8 && sizeof(typeof(a)) == sizeof(int);
}
