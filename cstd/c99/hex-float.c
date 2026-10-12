/* Hexadecimal floating constants */

static int v = (int)0x1.8p3;

int probe(void)
{
	return v == 12;
}
