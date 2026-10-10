/* The string functions the benchmarks call, for compilers that ship no C
 * library. Each compiler builds this with the benchmark's own options. */

#include <stddef.h>
#include <string.h>

void *memcpy(void *dest, const void *src, size_t n) {
  unsigned char *d = dest;
  const unsigned char *s = src;
  while (n--)
    *d++ = *s++;
  return dest;
}

void *memmove(void *dest, const void *src, size_t n) {
  unsigned char *d = dest;
  const unsigned char *s = src;
  if (d <= s)
    return memcpy(dest, src, n);
  d += n;
  s += n;
  while (n--)
    *--d = *--s;
  return dest;
}

void *memset(void *s, int c, size_t n) {
  unsigned char *p = s;
  while (n--)
    *p++ = (unsigned char)c;
  return s;
}

int memcmp(const void *a, const void *b, size_t n) {
  const unsigned char *p = a, *q = b;
  for (; n; n--, p++, q++)
    if (*p != *q)
      return *p - *q;
  return 0;
}

size_t strlen(const char *s) {
  const char *p = s;
  while (*p)
    p++;
  return p - s;
}

char *strcpy(char *dest, const char *src) {
  char *d = dest;
  while ((*d++ = *src++))
    ;
  return dest;
}

int strcmp(const char *a, const char *b) {
  while (*a && *a == *b)
    a++, b++;
  return (unsigned char)*a - (unsigned char)*b;
}
