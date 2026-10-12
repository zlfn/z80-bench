/* Case range expressions (case x ... y) */

static int small(int v)
{
	switch (v) {
	case 1 ... 5:
		return 1;
	default:
		return 0;
	}
}

int probe(void)
{
	return small(3) && !small(6);
}
