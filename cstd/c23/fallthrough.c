/* [[fallthrough]] */

static int count(int n)
{
	int c = 0;

	switch (n) {
	case 2:
		c++;
		[[fallthrough]];
	case 1:
		c++;
		break;
	default:
		break;
	}
	return c;
}

int probe(void)
{
	return count(2) == 2 && count(1) == 1;
}
