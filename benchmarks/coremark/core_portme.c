/* CoreMark port for z80-bench, after the barebones port in the CoreMark
 * sources (Copyright 2018 EEMBC, Apache License 2.0).
 *
 * The timed region is CoreMark's own start_time/stop_time. Its clock is a
 * stand-in that always reports ten seconds: the runner counts cycles instead,
 * and CoreMark otherwise counts a run under ten seconds as an error. The
 * result is whether CoreMark validated its run against the known CRCs. */

#include "bench.h"
#include "coremark.h"

/* The seeds of a 2K performance run, the run CoreMark can validate. */
volatile ee_s32 seed1_volatile = 0x0;
volatile ee_s32 seed2_volatile = 0x0;
volatile ee_s32 seed3_volatile = 0x66;
volatile ee_s32 seed4_volatile = ITERATIONS;
volatile ee_s32 seed5_volatile = 0;

ee_u32 default_num_contexts = 1;

#define EE_TICKS_PER_SEC 1000

static ee_u8 validated;
static ee_u8 failed;

void start_time(void)
{
    bench_begin();
}

void stop_time(void)
{
    bench_end();
}

CORE_TICKS get_time(void)
{
    return 10 * EE_TICKS_PER_SEC;
}

secs_ret time_in_secs(CORE_TICKS ticks)
{
    return ticks / EE_TICKS_PER_SEC;
}

static int starts_with(const char *s, const char *prefix)
{
    while (*prefix)
        if (*s++ != *prefix++)
            return 0;
    return 1;
}

void coremark_note(const char *fmt)
{
    if (starts_with(fmt, "Correct operation validated"))
        validated = 1;
    if (starts_with(fmt, "Errors detected") || starts_with(fmt, "Cannot validate"))
        failed = 1;
}

void portable_init(core_portable *p, int *argc, char *argv[])
{
    (void)argc;
    (void)argv;
    p->portable_id = 1;
}

void portable_fini(core_portable *p)
{
    p->portable_id = 0;
    bench_result = validated && !failed;
    bench_done();
}
