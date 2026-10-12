/* alignof of an incomplete array type */

int probe(void)
{
	return alignof(int[]) == alignof(int);
}
