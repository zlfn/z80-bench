/* Slay Some Earthly Demons VI */

/* The void of an empty parameter list takes no qualifier, no storage class
 * and no ... after it. The file must build as it is, and give a diagnostic
 * with each -DCASE=n. */

#ifndef CASE
void none(void);
void pointer(register void *p);
#elif CASE == 1
void qualified(const void);
#elif CASE == 2
void stored(register void);
#elif CASE == 3
void variadic(void, ...);
#endif
