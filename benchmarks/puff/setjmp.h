/* puff only longjmps when its input runs out, which this benchmark's input
 * never does. Not every toolchain here has setjmp, so all of them build puff
 * against this instead of their own. */

#ifndef BENCH_SETJMP_H
#define BENCH_SETJMP_H

typedef int jmp_buf[1];

#define setjmp(env) 0
#define longjmp(env, val) for (;;)

#endif
