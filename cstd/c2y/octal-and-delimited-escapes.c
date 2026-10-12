/* Obsolete implicitly octal literals and delimited escape sequences */

int probe(void)
{
	return 0o17 == 15 && '\x{41}' == 65 && '\o{101}' == 65;
}
