/* Slay Some Earthly Demons XI */

/* One identifier can no longer have both internal and external linkage in a
 * file. The file must build as it is, and give a diagnostic with each
 * -DCASE=n. */

#ifndef CASE
static int kept;

int inherit(void)
{
	/* Takes the internal linkage of the kept above. */
	extern int kept;

	return kept;
}
#elif CASE == 1
int first(void)
{
	extern int shared;

	return shared;
}

static int shared;
#elif CASE == 2
static int hidden;

int shadow(void)
{
	int hidden = 0;

	{
		/* The static hidden is out of sight, so this one is external. */
		extern int hidden;

		return hidden;
	}
}
#endif
