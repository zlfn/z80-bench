/* Thread-local storage (_Thread_local) */

static _Thread_local int counter = 3;

int probe(void)
{
	counter++;
	return counter == 4;
}
