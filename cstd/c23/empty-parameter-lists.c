/* Removal of function declarations without prototype */

/* In C23 an empty parameter list means no parameters, as (void) does, so the
 * call with an argument must be diagnosed. */

int none();

int call(void)
{
	return none(1);
}
