/* Enumerations with Bit-Precise Integer as Underlying Type */

enum small : unsigned _BitInt(8) { LOW, HIGH = 255 };

int probe(void)
{
	return HIGH == 255;
}
