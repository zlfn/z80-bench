/* constexpr objects */

constexpr int count = 4;
static int a[count];

int probe(void)
{
	constexpr unsigned char big = 200;

	return sizeof a == 4 * sizeof(int) && big == 200;
}
