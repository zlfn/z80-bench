/* Implicit return 0; in the main() function */

/* Reaching the } that ends main returns 0 in a hosted environment, so each
 * compiler builds this as it would a hosted program. Its assembly then shows
 * whether main leaves 0 where an int is returned, not what value() left. */

int value(void);

int main(void)
{
	value();
}
