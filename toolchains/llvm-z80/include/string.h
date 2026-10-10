/* llvm-z80 ships these functions in its runtime but no C library headers.
 * This declares the ones the benchmarks use. */

#ifndef _STRING_H
#define _STRING_H

#include <stddef.h>

void *memcpy(void *dest, const void *src, size_t n);
void *memmove(void *dest, const void *src, size_t n);
void *memset(void *s, int c, size_t n);
int memcmp(const void *a, const void *b, size_t n);
size_t strlen(const char *s);
char *strcpy(char *dest, const char *src);
int strcmp(const char *a, const char *b);

#endif
