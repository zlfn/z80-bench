/* Labels before declarations and end of blocks */

int probe(void)
{
	int r = 0;

	goto next;
next:
	int v = 1;
	r = v;
	{
		goto done;
	done:
	}
	return r;
}
