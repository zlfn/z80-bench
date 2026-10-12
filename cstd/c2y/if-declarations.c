/* if declarations */

static int three(void)
{
	return 3;
}

int probe(void)
{
	if (int x = three(); x > 2) {
		switch (int y = x - 1; y) {
		case 2:
			return 1;
		default:
			return 0;
		}
	}
	return 0;
}
