/* Idempotent cvr-qualifiers */

typedef const int cint;

int probe(void)
{
	const cint x = 4;
	const const int y = 5;

	return x + y == 9;
}
