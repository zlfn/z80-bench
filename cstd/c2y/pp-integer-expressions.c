/* Preprocessor integer expressions */

/* After macro replacement a #if holds only integer and character constants
 * and punctuators, even where it is not evaluated, so a string literal there
 * is diagnosed. The file must build as it is, and give a diagnostic with
 * each -DCASE=n. */

#ifndef CASE
#if 1 ? 1 : ('a' + 5)
int fine;
#endif
#elif CASE == 1
#if 1 ? 1 : (""[0] + 5)
#endif
#endif
