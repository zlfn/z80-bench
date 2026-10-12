/* Predefined true and false */

int probe(void)
{
	return true == 1 && false == 0 && _Generic(true, bool: 1, default: 0);
}
