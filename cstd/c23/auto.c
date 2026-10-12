/* Type inference in object definitions (auto) */

int probe(void)
{
	auto x = 3;
	auto y = x + 1;

	return sizeof x == sizeof(int) && y == 4;
}
