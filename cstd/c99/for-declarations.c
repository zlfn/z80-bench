/* init-statement in for loops */

int probe(void)
{
	int sum = 0;

	for (int i = 0; i < 4; i++)
		sum += i;
	return sum == 6;
}
