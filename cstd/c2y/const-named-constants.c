/* Const integer declarations as implicit named constants */

static const int count = 4;
static int a[count];

int probe(void)
{
	return sizeof a == 4 * sizeof(int);
}
