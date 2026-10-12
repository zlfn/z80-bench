/* Matching of Multi-Dimensional Arrays in Generic Selection Expressions */

int probe(void)
{
	return _Generic(int[3][2], int[*][*]: 1, default: 0)
	    && _Generic(int[3][2], int[3][*]: 1, default: 0)
	    && _Generic(int[3][2], int[*][2]: 1, default: 0);
}
