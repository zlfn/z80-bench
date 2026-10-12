/* Slay Some Earthly Demons XIV */

/* Pasting tokens together may not spell a universal character name. The file
 * must build as it is, and give a diagnostic with each -DCASE=n. */

#define PASTE(a, b) a ## b

#ifndef CASE
int PASTE(cat, 1) = 1;
#elif CASE == 1
int PASTE(\, u00e9) = 2;
#endif
