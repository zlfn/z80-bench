/* [[deprecated]] */

[[deprecated]] static int old(void)
{
	return 1;
}

[[deprecated("use old() instead")]] static int older(void)
{
	return 1;
}

int probe(void)
{
	return old() && older();
}
