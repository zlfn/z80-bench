/* Bit-precise integer types (_BitInt) */

int probe(void)
{
	_BitInt(12) s = 2047;
	unsigned _BitInt(9) u = 511;

	u++;
	return s == 2047 && u == 0;
}
