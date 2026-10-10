/* stdcbench port for z80-bench.
 *
 * Only c90base is enabled. c90lib needs a hosted C library that not every
 * toolchain here has, and upstream has not implemented c90float or c90double.
 *
 * c90base repeats its work until STDCBENCH_CLOCKS_PER_SEC * 8 clock units
 * have passed. The emulator has no clock for the guest to read, so portme.c
 * supplies one that advances a fixed step per call: c90base then does exactly
 * STDCBENCH_ITERATIONS rounds of work, and the runner counts their cycles. */

typedef unsigned long stdcbench_clock_t;

#define STDCBENCH_CLOCKS_PER_SEC 100

#define C90BASE
#undef C90FLOAT
#undef C90DOUBLE
#undef C90LIB

#define STDCBENCH_C90BASE_UNITS (STDCBENCH_CLOCKS_PER_SEC * 8ul)

#ifndef STDCBENCH_ITERATIONS
#define STDCBENCH_ITERATIONS 1
#endif
