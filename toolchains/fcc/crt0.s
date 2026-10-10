;
;	Startup for the benchmarks: the stack at the top of memory, .bss
;	cleared, then main.
;
		.export start

		.code
start:
		ld	sp,0
		ld	hl,__bss
		ld	bc,__bss_size
clear:
		ld	a,b
		or	c
		jr	z,run
		ld	(hl),0
		inc	hl
		dec	bc
		jr	clear
run:
		call	_main
halt:
		jr	halt
