/* The Elvis operator ?: */

static int zero(void)
{
	return 0;
}

int probe(void)
{
	return (zero() ?: 5) == 5 && (3 ?: 5) == 3;
}
