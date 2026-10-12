/* New spelling of keywords */

static_assert(alignof(int) >= 1);

int probe(void)
{
	alignas(2) char c = 0;
	static thread_local int t = 1;
	bool b = true;

	return b && t == 1 && c == 0;
}
