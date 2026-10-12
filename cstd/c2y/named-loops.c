/* Named loops */

int probe(void)
{
	int n = 0;

	outer:
	for (int i = 0; i < 5; i++) {
		for (int j = 0; j < 5; j++) {
			if (j == 2)
				continue outer;
			if (i == 3)
				break outer;
			n++;
		}
	}
	return n == 6;
}
