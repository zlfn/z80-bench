/* Predefined variable __func__ */

int probe(void)
{
	return __func__[0] == 'p' && __func__[4] == 'e' && __func__[5] == 0;
}
