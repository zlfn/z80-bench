/* Compatibility of Pointers to Arrays with Qualifiers */

/* A pointer to an array converts to one to an array of const elements, as a
 * pointer to an element converts to one to a const element, so none of this
 * may be diagnosed. */

static int grid[2][2];

static int corner(const int (*rows)[2])
{
	return rows[1][1];
}

int use(void)
{
	const int (*p)[2] = grid;

	return corner(grid) + p[0][0];
}
