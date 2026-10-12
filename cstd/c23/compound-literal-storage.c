/* Storage-class specifiers for compound literals */

static int *keep(void)
{
	return &(static int){ 5 };
}

int probe(void)
{
	return *keep() == 5;
}
