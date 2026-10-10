; Startup for the benchmarks: the stack at the top of memory, .bss cleared,
; then main.
	.section .text.crt0,"ax",@progbits
	.global	__start
__start:
	ld	sp, 0
	ld	hl, __bss_start
	ld	bc, __bss_size
	ld	a, b
	or	c
	jr	z, .Lmain
.Lclear:
	ld	(hl), 0
	inc	hl
	dec	bc
	ld	a, b
	or	c
	jr	nz, .Lclear
.Lmain:
	call	_main
.Lhalt:
	jr	.Lhalt
