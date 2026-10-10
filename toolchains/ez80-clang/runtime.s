; Z80-mode helper functions for CE-Programming's ez80-clang. CEdev ships
; its runtime for ADL mode only, so these follow the compiler's Z80-mode
; convention instead:
;   16-bit: HL op BC -> HL, shift counts in C
;   32-bit: DE:HL op IY:BC -> DE:HL, shifts take IY:BC and the count in A
;   64-bit: BC:DE:HL plus the top word on the stack -> IY:BC:DE:HL
;   compares return their result in the flags
; Every register that is not a result is preserved. The multiply and divide
; loops come from llvm-z80's runtime. One section per function, so the
; linker keeps only what a program calls.

; ---------------------------------------------------------------------------
; Frames, calls and flags

	.section .text.__frameset,"ax",@progbits
	.global	__frameset
__frameset:
	pop	de
	push	ix
	ld	ix, 0
	add	ix, sp
	add	hl, sp
	ld	sp, hl
	ex	de, hl
	jp	(hl)

	.section .text.__frameset0,"ax",@progbits
	.global	__frameset0
__frameset0:
	pop	hl
	push	ix
	ld	ix, 0
	add	ix, sp
	jp	(hl)

	.section .text.__indcallhl,"ax",@progbits
	.global	__indcallhl
__indcallhl:
	jp	(hl)

; Turns the flags of a signed subtraction into S = less than.
	.section .text.__setflag,"ax",@progbits
	.global	__setflag
__setflag:
	ret	po
	push	af
	ex	(sp), hl
	ld	a, l
	xor	0x80
	ld	l, a
	ex	(sp), hl
	pop	af
	ret

; ---------------------------------------------------------------------------
; 8-bit

; A % C -> A
	.section .text.__bremu,"ax",@progbits
	.global	__bremu
__bremu:
	push	bc
	push	hl
	ld	h, a
	xor	a
	ld	b, 8
.Lbremu_loop:
	sla	h
	rla
	jr	c, .Lbremu_sub
	cp	c
	jr	c, .Lbremu_next
.Lbremu_sub:
	sub	c
.Lbremu_next:
	djnz	.Lbremu_loop
	pop	hl
	pop	bc
	ret

; A >> B -> A
	.section .text.__bshru,"ax",@progbits
	.global	__bshru
__bshru:
	push	bc
	inc	b
	jr	.Lbshru_next
.Lbshru_loop:
	srl	a
.Lbshru_next:
	djnz	.Lbshru_loop
	pop	bc
	ret

; ---------------------------------------------------------------------------
; 16-bit

	.section .text.__sand,"ax",@progbits
	.global	__sand
__sand:
	push	af
	ld	a, l
	and	c
	ld	l, a
	ld	a, h
	and	b
	ld	h, a
	pop	af
	ret

	.section .text.__sor,"ax",@progbits
	.global	__sor
__sor:
	push	af
	ld	a, l
	or	c
	ld	l, a
	ld	a, h
	or	b
	ld	h, a
	pop	af
	ret

	.section .text.__sxor,"ax",@progbits
	.global	__sxor
__sxor:
	push	af
	ld	a, l
	xor	c
	ld	l, a
	ld	a, h
	xor	b
	ld	h, a
	pop	af
	ret

	.section .text.__snot,"ax",@progbits
	.global	__snot
__snot:
	push	af
	ld	a, l
	cpl
	ld	l, a
	ld	a, h
	cpl
	ld	h, a
	pop	af
	ret

	.section .text.__sneg,"ax",@progbits
	.global	__sneg
__sneg:
	push	af
	xor	a
	sub	l
	ld	l, a
	sbc	a, a
	sub	h
	ld	h, a
	pop	af
	ret

	.section .text.__sshl,"ax",@progbits
	.global	__sshl
__sshl:
	push	bc
	ld	b, c
	inc	b
	jr	.Lsshl_next
.Lsshl_loop:
	add	hl, hl
.Lsshl_next:
	djnz	.Lsshl_loop
	pop	bc
	ret

	.section .text.__sshru,"ax",@progbits
	.global	__sshru
__sshru:
	push	bc
	ld	b, c
	inc	b
	jr	.Lsshru_next
.Lsshru_loop:
	srl	h
	rr	l
.Lsshru_next:
	djnz	.Lsshru_loop
	pop	bc
	ret

	.section .text.__sshrs,"ax",@progbits
	.global	__sshrs
__sshrs:
	push	bc
	ld	b, c
	inc	b
	jr	.Lsshrs_next
.Lsshrs_loop:
	sra	h
	rr	l
.Lsshrs_next:
	djnz	.Lsshrs_loop
	pop	bc
	ret

; HL * BC -> HL
	.section .text.__smulu,"ax",@progbits
	.global	__smulu
__smulu:
	push	af
	push	bc
	push	de
	ex	de, hl
	xor	a
	ld	h, a
	ld	l, a
	or	b
	ld	b, 16
	jr	nz, .Lsmulu_full
	ld	b, 8
	ld	a, c
.Lsmulu_loop:
	add	hl, hl
.Lsmulu_full:
	rl	c
	rla
	jr	nc, .Lsmulu_skip
	add	hl, de
.Lsmulu_skip:
	djnz	.Lsmulu_loop
	pop	de
	pop	bc
	pop	af
	ret

	.section .text.__sdivu,"ax",@progbits
	.global	__sdivu
__sdivu:
	push	af
	push	bc
	push	de
	ld	d, b
	ld	e, c
	call	__ce_udivmod16
	ex	de, hl
	pop	de
	pop	bc
	pop	af
	ret

	.section .text.__sremu,"ax",@progbits
	.global	__sremu
__sremu:
	push	af
	push	bc
	push	de
	ld	d, b
	ld	e, c
	call	__ce_udivmod16
	pop	de
	pop	bc
	pop	af
	ret

	.section .text.__sdivs,"ax",@progbits
	.global	__sdivs
__sdivs:
	push	af
	push	bc
	push	de
	ld	d, b
	ld	e, c
	call	__ce_divmod16
	ex	de, hl
	pop	de
	pop	bc
	pop	af
	ret

	.section .text.__srems,"ax",@progbits
	.global	__srems
__srems:
	push	af
	push	bc
	push	de
	ld	d, b
	ld	e, c
	call	__ce_divmod16
	pop	de
	pop	bc
	pop	af
	ret

; HL / DE -> DE quotient, HL remainder. Uses AF and BC.
	.section .text.__ce_udivmod16,"ax",@progbits
__ce_udivmod16:
	ld	a, e
	and	0x80
	or	d
	jr	nz, .Ludm16_wide
	ld	b, 16
	add	hl, hl
.Ludm16_8loop:
	rla
	sub	e
	jr	nc, .Ludm16_8ok
	add	a, e
.Ludm16_8ok:
	ccf
	adc	hl, hl
	djnz	.Ludm16_8loop
	ld	e, a
	ex	de, hl
	ret
.Ludm16_wide:
	ld	b, h
	ld	c, l
	ld	hl, 0
	ld	a, 16
.Ludm16_loop:
	sla	c
	rl	b
	adc	hl, hl
	jr	c, .Ludm16_over
	sbc	hl, de
	jr	nc, .Ludm16_set
	add	hl, de
	jr	.Ludm16_next
.Ludm16_over:
	or	a
	sbc	hl, de
.Ludm16_set:
	inc	c
.Ludm16_next:
	dec	a
	jr	nz, .Ludm16_loop
	ld	d, b
	ld	e, c
	ret

; Signed HL / DE -> DE quotient, HL remainder. Uses AF and BC.
	.section .text.__ce_divmod16,"ax",@progbits
__ce_divmod16:
	ld	a, h
	xor	d
	bit	7, h
	push	af
	jr	z, .Ldm16_pos
	xor	a
	sub	l
	ld	l, a
	sbc	a, a
	sub	h
	ld	h, a
.Ldm16_pos:
	bit	7, d
	jr	z, .Ldm16_posd
	xor	a
	sub	e
	ld	e, a
	sbc	a, a
	sub	d
	ld	d, a
.Ldm16_posd:
	call	__ce_udivmod16
	pop	af
	jr	z, .Ldm16_rem
	ld	b, h
	ld	c, l
	ld	hl, 0
	or	a
	sbc	hl, bc
.Ldm16_rem:
	bit	7, a
	ret	z
	xor	a
	sub	e
	ld	e, a
	sbc	a, a
	sub	d
	ld	d, a
	ret

; ---------------------------------------------------------------------------
; 32-bit

	.section .text.__ladd,"ax",@progbits
	.global	__ladd
__ladd:
	add	hl, bc
	ex	de, hl
	push	bc
	push	iy
	pop	bc
	adc	hl, bc
	pop	bc
	ex	de, hl
	ret

	.section .text.__lsub,"ax",@progbits
	.global	__lsub
__lsub:
	or	a
	sbc	hl, bc
	ex	de, hl
	push	bc
	push	iy
	pop	bc
	sbc	hl, bc
	pop	bc
	ex	de, hl
	ret

	.section .text.__land,"ax",@progbits
	.global	__land
__land:
	push	af
	ld	a, l
	and	c
	ld	l, a
	ld	a, h
	and	b
	ld	h, a
	ld	a, e
	and	iyl
	ld	e, a
	ld	a, d
	and	iyh
	ld	d, a
	pop	af
	ret

	.section .text.__lor,"ax",@progbits
	.global	__lor
__lor:
	push	af
	ld	a, l
	or	c
	ld	l, a
	ld	a, h
	or	b
	ld	h, a
	ld	a, e
	or	iyl
	ld	e, a
	ld	a, d
	or	iyh
	ld	d, a
	pop	af
	ret

	.section .text.__lxor,"ax",@progbits
	.global	__lxor
__lxor:
	push	af
	ld	a, l
	xor	c
	ld	l, a
	ld	a, h
	xor	b
	ld	h, a
	ld	a, e
	xor	iyl
	ld	e, a
	ld	a, d
	xor	iyh
	ld	d, a
	pop	af
	ret

	.section .text.__lnot,"ax",@progbits
	.global	__lnot
__lnot:
	push	af
	ld	a, l
	cpl
	ld	l, a
	ld	a, h
	cpl
	ld	h, a
	ld	a, e
	cpl
	ld	e, a
	ld	a, d
	cpl
	ld	d, a
	pop	af
	ret

; Z = equal, C = DE:HL below IY:BC.
	.section .text.__lcmpu,"ax",@progbits
	.global	__lcmpu
__lcmpu:
	push	hl
	push	bc
	push	iy
	pop	bc
	ld	h, d
	ld	l, e
	or	a
	sbc	hl, bc
	pop	bc
	pop	hl
	ret	nz
	push	hl
	or	a
	sbc	hl, bc
	pop	hl
	ret

; The flags of DE:HL - IY:BC, for __setflag.
	.section .text.__lcmps,"ax",@progbits
	.global	__lcmps
__lcmps:
	push	hl
	push	de
	push	bc
	or	a
	sbc	hl, bc
	ex	de, hl
	push	iy
	pop	bc
	sbc	hl, bc
	pop	bc
	pop	de
	pop	hl
	ret

; Z = zero, S = negative.
	.section .text.__lcmpzero,"ax",@progbits
	.global	__lcmpzero
__lcmpzero:
	push	bc
	ld	b, a
	ld	a, d
	or	e
	or	h
	or	l
	jr	z, .Llcmpzero_done
	ld	a, d
	or	1
.Llcmpzero_done:
	ld	a, b
	pop	bc
	ret

; IY:BC << A -> DE:HL
	.section .text.__lshl,"ax",@progbits
	.global	__lshl
__lshl:
	push	af
	push	iy
	pop	de
	ld	h, b
	ld	l, c
.Llshl_byte:
	cp	8
	jr	c, .Llshl_bits
	ld	d, e
	ld	e, h
	ld	h, l
	ld	l, 0
	sub	8
	jr	.Llshl_byte
.Llshl_bits:
	or	a
	jr	z, .Llshl_done
.Llshl_loop:
	add	hl, hl
	rl	e
	rl	d
	dec	a
	jr	nz, .Llshl_loop
.Llshl_done:
	pop	af
	ret

; IY:BC >> A -> DE:HL
	.section .text.__lshru,"ax",@progbits
	.global	__lshru
__lshru:
	push	af
	push	iy
	pop	de
	ld	h, b
	ld	l, c
.Llshru_byte:
	cp	8
	jr	c, .Llshru_bits
	ld	l, h
	ld	h, e
	ld	e, d
	ld	d, 0
	sub	8
	jr	.Llshru_byte
.Llshru_bits:
	or	a
	jr	z, .Llshru_done
.Llshru_loop:
	srl	d
	rr	e
	rr	h
	rr	l
	dec	a
	jr	nz, .Llshru_loop
.Llshru_done:
	pop	af
	ret

	.section .text.__lshrs,"ax",@progbits
	.global	__lshrs
__lshrs:
	push	af
	push	bc
	push	iy
	pop	de
	ld	h, b
	ld	l, c
	ld	b, a
.Llshrs_byte:
	ld	a, b
	cp	8
	jr	c, .Llshrs_bits
	ld	l, h
	ld	h, e
	ld	e, d
	ld	a, d
	rla
	sbc	a, a
	ld	d, a
	ld	a, b
	sub	8
	ld	b, a
	jr	.Llshrs_byte
.Llshrs_bits:
	or	a
	jr	z, .Llshrs_done
.Llshrs_loop:
	sra	d
	rr	e
	rr	h
	rr	l
	djnz	.Llshrs_loop
.Llshrs_done:
	pop	bc
	pop	af
	ret

; DE:HL * IY:BC -> DE:HL
	.section .text.__lmulu,"ax",@progbits
	.global	__lmulu
__lmulu:
	push	af
	push	ix
	push	iy
	push	bc
	push	de
	push	hl
	ld	ix, 0
	add	ix, sp
	; (ix+0) a low, (ix+2) a high, (ix+4) b low, (ix+6) b high
	ld	d, b
	ld	e, c
	call	__ce_umul16
	push	hl
	push	de
	ld	a, (ix+6)
	or	(ix+7)
	jr	z, .Llmulu_bhi
	ld	l, (ix+0)
	ld	h, (ix+1)
	ld	e, (ix+6)
	ld	d, (ix+7)
	call	__ce_mul16
	pop	de
	add	hl, de
	push	hl
.Llmulu_bhi:
	ld	a, (ix+2)
	or	(ix+3)
	jr	z, .Llmulu_ahi
	ld	l, (ix+2)
	ld	h, (ix+3)
	ld	e, (ix+4)
	ld	d, (ix+5)
	call	__ce_mul16
	pop	de
	add	hl, de
	push	hl
.Llmulu_ahi:
	pop	de
	pop	hl
	ld	sp, ix
	pop	bc
	pop	bc
	pop	bc
	pop	iy
	pop	ix
	pop	af
	ret

; DE:HL / IY:BC -> DE:HL
	.section .text.__ldivu,"ax",@progbits
	.global	__ldivu
__ldivu:
	push	af
	push	ix
	push	iy
	push	bc
	ld	ix, -4
	add	ix, sp
	ex	de, hl
	call	__ce_udivmod32
	ex	de, hl
	pop	bc
	pop	iy
	pop	ix
	pop	af
	ret

	.section .text.__lremu,"ax",@progbits
	.global	__lremu
__lremu:
	push	af
	push	ix
	push	iy
	push	bc
	ld	ix, -4
	add	ix, sp
	ex	de, hl
	call	__ce_udivmod32
	push	iy
	pop	de
	ld	h, b
	ld	l, c
	pop	bc
	pop	iy
	pop	ix
	pop	af
	ret

	.section .text.__ldivs,"ax",@progbits
	.global	__ldivs
__ldivs:
	push	af
	push	ix
	push	iy
	push	bc
	push	iy
	push	bc
	ld	ix, -4
	add	ix, sp
	ex	de, hl
	ld	a, h
	xor	(ix+7)
	push	af
	call	__ce_abs32
	call	__ce_udivmod32
	pop	af
	bit	7, a
	call	nz, __ce_neg32
	ex	de, hl
	pop	bc
	pop	bc
	pop	bc
	pop	iy
	pop	ix
	pop	af
	ret

	.section .text.__lrems,"ax",@progbits
	.global	__lrems
__lrems:
	push	af
	push	ix
	push	iy
	push	bc
	push	iy
	push	bc
	ld	ix, -4
	add	ix, sp
	ex	de, hl
	ld	a, h
	push	af
	call	__ce_abs32
	call	__ce_udivmod32
	push	iy
	pop	de
	ld	h, b
	ld	l, c
	ex	de, hl
	pop	af
	bit	7, a
	call	nz, __ce_neg32
	ex	de, hl
	pop	bc
	pop	bc
	pop	bc
	pop	iy
	pop	ix
	pop	af
	ret

; HL * DE -> HL, low half. Uses AF, BC and DE.
	.section .text.__ce_mul16,"ax",@progbits
__ce_mul16:
	ld	b, d
	ld	c, e
	ex	de, hl
	xor	a
	ld	h, a
	ld	l, a
	or	b
	ld	b, 16
	jr	nz, .Lmul16_full
	ld	b, 8
	ld	a, c
.Lmul16_loop:
	add	hl, hl
.Lmul16_full:
	rl	c
	rla
	jr	nc, .Lmul16_skip
	add	hl, de
.Lmul16_skip:
	djnz	.Lmul16_loop
	ret

; HL * DE -> DE:HL. Uses AF and BC.
	.section .text.__ce_umul16,"ax",@progbits
__ce_umul16:
	ld	b, h
	ld	c, l
	ld	hl, 0
	ld	a, d
	or	a
	ld	a, 16
	jr	nz, .Lumul16_loop
	ld	d, e
	ld	e, h
	ld	a, 8
.Lumul16_loop:
	add	hl, hl
	rl	e
	rl	d
	jr	nc, .Lumul16_next
	add	hl, bc
	jr	nc, .Lumul16_next
	inc	de
.Lumul16_next:
	dec	a
	jr	nz, .Lumul16_loop
	ret

; HL:DE (HL high) / (ix+4..7) -> HL:DE quotient, IY:BC remainder. Uses every
; register but IX.
	.section .text.__ce_udivmod32,"ax",@progbits
__ce_udivmod32:
	ld	a, (ix+6)
	or	(ix+7)
	jr	nz, .Ludm32_big
	ld	iy, 0
	push	de
	ld	e, (ix+4)
	ld	d, (ix+5)
	ld	a, l
	sub	e
	ld	a, h
	sbc	a, d
	jr	c, .Ludm32_lo
	call	__ce_udivmod16
	push	de
	pop	iy
	ld	e, (ix+4)
	ld	d, (ix+5)
.Ludm32_lo:
	pop	bc
	ld	a, b
	ld	b, 16
.Ludm32_loop:
	rl	c
	rla
	adc	hl, hl
	jr	c, .Ludm32_over
	sbc	hl, de
	jr	nc, .Ludm32_next
	add	hl, de
.Ludm32_next:
	djnz	.Ludm32_loop
	rl	c
	rla
	cpl
	ld	d, a
	ld	a, c
	cpl
	ld	e, a
	ld	b, h
	ld	c, l
	push	iy
	pop	hl
	ld	iy, 0
	ret
.Ludm32_over:
	or	a
	sbc	hl, de
	or	a
	jr	.Ludm32_next
.Ludm32_big:
	push	de
	pop	iy
	ld	de, 0
	ld	c, (ix+4)
	ld	b, 16
.Ludm32_bigloop:
	add	iy, iy
	adc	hl, hl
	rl	e
	rl	d
	jr	c, .Ludm32_sub
	ld	a, l
	sub	c
	ld	a, h
	sbc	a, (ix+5)
	ld	a, e
	sbc	a, (ix+6)
	ld	a, d
	sbc	a, (ix+7)
	jr	c, .Ludm32_bignext
.Ludm32_sub:
	ld	a, l
	sub	c
	ld	l, a
	ld	a, h
	sbc	a, (ix+5)
	ld	h, a
	ld	a, e
	sbc	a, (ix+6)
	ld	e, a
	ld	a, d
	sbc	a, (ix+7)
	ld	d, a
	inc	iy
.Ludm32_bignext:
	djnz	.Ludm32_bigloop
	ld	b, h
	ld	c, l
	push	iy
	push	de
	pop	iy
	pop	de
	ld	hl, 0
	ret

; Replaces the divisor at (ix+4..7) and the dividend in HL:DE with their
; magnitudes. __ce_neg32 negates HL:DE.
	.section .text.__ce_abs32,"ax",@progbits
__ce_abs32:
	bit	7, (ix+7)
	jr	z, .Labs32_dividend
	xor	a
	ld	b, a
	sub	(ix+4)
	ld	(ix+4), a
	ld	a, b
	sbc	a, (ix+5)
	ld	(ix+5), a
	ld	a, b
	sbc	a, (ix+6)
	ld	(ix+6), a
	ld	a, b
	sbc	a, (ix+7)
	ld	(ix+7), a
.Labs32_dividend:
	bit	7, h
	ret	z
__ce_neg32:
	xor	a
	ld	b, a
	sub	e
	ld	e, a
	ld	a, b
	sbc	a, d
	ld	d, a
	ld	a, b
	sbc	a, l
	ld	l, a
	ld	a, b
	sbc	a, h
	ld	h, a
	ret

; ---------------------------------------------------------------------------
; 64-bit

; a * b, a in BC:DE:HL with its top word at (sp+2), b at (sp+4..11)
	.section .text.__llmulu,"ax",@progbits
	.global	__llmulu
__llmulu:
	push	ix
	push	af
	ld	ix, 0
	add	ix, sp
	; (ix+6) a3, (ix+8) b0, (ix+10) b1, (ix+12) b2, (ix+14) b3
	push	bc
	push	de
	push	hl
	; (ix-6) a0, (ix-4) a1, (ix-2) a2
	ld	hl, 0
	push	hl
	push	hl
	push	hl
	push	hl
	ld	iy, 0
	add	iy, sp
	; (iy+0..7) the product, each partial product added in at word i+j
	ld	b, 4
	ld	l, (ix-6)
	ld	h, (ix-5)
	ld	e, (ix+8)
	ld	d, (ix+9)
	call	__ce_llmac
	inc	iy
	inc	iy
	ld	b, 3
	ld	l, (ix-6)
	ld	h, (ix-5)
	ld	e, (ix+10)
	ld	d, (ix+11)
	call	__ce_llmac
	ld	b, 3
	ld	l, (ix-4)
	ld	h, (ix-3)
	ld	e, (ix+8)
	ld	d, (ix+9)
	call	__ce_llmac
	inc	iy
	inc	iy
	ld	b, 2
	ld	l, (ix-6)
	ld	h, (ix-5)
	ld	e, (ix+12)
	ld	d, (ix+13)
	call	__ce_llmac
	ld	b, 2
	ld	l, (ix-4)
	ld	h, (ix-3)
	ld	e, (ix+10)
	ld	d, (ix+11)
	call	__ce_llmac
	ld	b, 2
	ld	l, (ix-2)
	ld	h, (ix-1)
	ld	e, (ix+8)
	ld	d, (ix+9)
	call	__ce_llmac
	inc	iy
	inc	iy
	ld	b, 1
	ld	l, (ix-6)
	ld	h, (ix-5)
	ld	e, (ix+14)
	ld	d, (ix+15)
	call	__ce_llmac
	ld	b, 1
	ld	l, (ix-4)
	ld	h, (ix-3)
	ld	e, (ix+12)
	ld	d, (ix+13)
	call	__ce_llmac
	ld	b, 1
	ld	l, (ix-2)
	ld	h, (ix-1)
	ld	e, (ix+10)
	ld	d, (ix+11)
	call	__ce_llmac
	ld	b, 1
	ld	l, (ix+6)
	ld	h, (ix+7)
	ld	e, (ix+8)
	ld	d, (ix+9)
	call	__ce_llmac
	pop	hl
	pop	de
	pop	bc
	pop	iy
	ld	sp, ix
	pop	af
	pop	ix
	ret

; Adds HL * DE into the B words at (iy+0). Uses AF, DE and HL.
	.section .text.__ce_llmac,"ax",@progbits
__ce_llmac:
	ld	a, h
	or	l
	ret	z
	ld	a, d
	or	e
	ret	z
	push	bc
	call	__ce_umul16
	pop	bc
	ld	a, (iy+0)
	add	a, l
	ld	(iy+0), a
	ld	a, (iy+1)
	adc	a, h
	ld	(iy+1), a
	dec	b
	ret	z
	ld	a, (iy+2)
	adc	a, e
	ld	(iy+2), a
	ld	a, (iy+3)
	adc	a, d
	ld	(iy+3), a
	dec	b
	ret	z
	ld	a, (iy+4)
	adc	a, 0
	ld	(iy+4), a
	ld	a, (iy+5)
	adc	a, 0
	ld	(iy+5), a
	dec	b
	ret	z
	ld	a, (iy+6)
	adc	a, 0
	ld	(iy+6), a
	ld	a, (iy+7)
	adc	a, 0
	ld	(iy+7), a
	ret

; BC:DE:HL with its top word at (sp+2), shifted right by the count at (sp+4)
	.section .text.__llshru,"ax",@progbits
	.global	__llshru
__llshru:
	push	af
	push	ix
	ld	ix, 0
	add	ix, sp
	; (ix+6) top word, (ix+8) count
	push	hl
	ld	l, (ix+6)
	ld	h, (ix+7)
	ex	(sp), hl
	pop	iy
	ld	a, (ix+8)
.Lllshru_word:
	cp	16
	jr	c, .Lllshru_byte
	ex	de, hl
	ld	d, b
	ld	e, c
	push	iy
	pop	bc
	ld	iy, 0
	sub	16
	jr	.Lllshru_word
.Lllshru_byte:
	cp	8
	jr	c, .Lllshru_bits
	ld	l, h
	ld	h, e
	ld	e, d
	ld	d, c
	ld	c, b
	ld	b, iyl
	ld	iyl, iyh
	ld	iyh, 0
	sub	8
.Lllshru_bits:
	or	a
	jr	z, .Lllshru_done
	ld	(ix+8), a
.Lllshru_loop:
	ld	a, iyh
	srl	a
	ld	iyh, a
	ld	a, iyl
	rra
	ld	iyl, a
	rr	b
	rr	c
	rr	d
	rr	e
	rr	h
	rr	l
	dec	(ix+8)
	jr	nz, .Lllshru_loop
.Lllshru_done:
	pop	ix
	pop	af
	ret
