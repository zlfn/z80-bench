/* Generic replacement (quasi-literals) */

static const char word[] = _Generic(0, default: "word");
enum { two = (int)(_Generic(0, int: (2.5))) };

int probe(void)
{
	return sizeof word == 5 && word[3] == 'd' && two == 2;
}
