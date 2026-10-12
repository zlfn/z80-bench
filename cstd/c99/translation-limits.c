/* Increased translation limits */

/* 63 significant initial characters in an internal identifier and 31 in an
 * external one. */
static int abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijX = 1;
static int abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijY = 2;
int ext_abcdefghijklmnopqrstuvwxyzX = 3;
int ext_abcdefghijklmnopqrstuvwxyzY = 4;

int probe(void)
{
	return abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijX == 1
	    && abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijY == 2
	    && ext_abcdefghijklmnopqrstuvwxyzX == 3 && ext_abcdefghijklmnopqrstuvwxyzY == 4;
}
