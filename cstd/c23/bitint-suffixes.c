/* Suffixes for bit-precise integer constants */

int probe(void)
{
	return 5wb == 5 && 7uwb == 7u && sizeof(255uwb) <= sizeof(int);
}
