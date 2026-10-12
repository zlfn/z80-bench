/* Enumerations with fixed underlying types */

enum small : unsigned char { LOW, HIGH = 255 };

int probe(void)
{
	enum small s = HIGH;

	return sizeof(enum small) == 1 && s == 255;
}
