/* Improved Normal Enumerations */

/* Wider than a 16-bit int. */
enum big { BIG = 70000 };

int probe(void)
{
	return BIG == 70000L;
}
