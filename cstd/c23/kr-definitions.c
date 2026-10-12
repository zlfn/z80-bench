/* Removal of function definitions without prototype */

/* C23 has no definitions with an identifier list, so this one must be
 * diagnosed. */

int add(a, b)
	int a, b;
{
	return a + b;
}
