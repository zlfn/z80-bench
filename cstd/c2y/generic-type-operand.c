/* Generic selection expression with a type operand */

int probe(void)
{
	return _Generic(int, int: 1, default: 0) && _Generic(const int, const int: 1, default: 0);
}
