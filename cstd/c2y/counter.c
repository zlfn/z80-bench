/* The __COUNTER__ predefined macro */

int probe(void)
{
	int a = __COUNTER__;
	int b = __COUNTER__;

	return b == a + 1;
}
