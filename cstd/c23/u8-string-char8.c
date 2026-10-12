/* Type change of u8 string literals to char8_t[] */

int probe(void)
{
	return _Generic(u8"a"[0], unsigned char: 1, default: 0);
}
