/* Fuzix's freestanding stddef.h leaves out size_t, which its C library
 * defines elsewhere. */

#ifndef _STDDEF_H
#define _STDDEF_H

#include <stdint.h>

typedef uint16_t size_t;

#define NULL ((void *)0)
#define offsetof(type, ident) ((size_t)&((type *)0)->ident)

#endif
