/* One flat 64 KB memory: code and data from address 0, the stack at the top. */
ENTRY(__start)
SECTIONS {
  . = 0;
  .text : { KEEP(*(.text.crt0)) *(.text .text.*) }
  .rodata : { *(.rodata .rodata.*) }
  .data : { *(.data .data.*) }
  /* z88dk's routines, built for this address once the program is linked. */
  .z88dk : { __z88dk = .; KEEP(*(.z88dk)) }
  .bss (NOLOAD) : {
    __bss_start = .;
    *(.bss .bss.*) *(COMMON)
    __bss_end = .;
  }
  __bss_size = __bss_end - __bss_start;
  /DISCARD/ : { *(.note.*) *(.comment) }
}
