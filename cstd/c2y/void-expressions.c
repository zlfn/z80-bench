/* Slay Some Earthly Demons X */

static void nothing(void)
{
}

/* An expression of type void can be cast to void once more, and a generic
 * association for void picks it. */
int probe(void)
{
	(void)(void)nothing();
	return _Generic(nothing(), void: 1, default: 0);
}
