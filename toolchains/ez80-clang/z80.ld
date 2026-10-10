/* One flat 64 KB memory: code and data from address 0, the stack at the top. */
ENTRY(__start)
SECTIONS {
  . = 0;
  .text : { KEEP(*(.text.crt0)) *(.text .text.*) }
  .rodata : { *(.rodata .rodata.*) }
  .data : { *(.data .data.*) }
  .bss (NOLOAD) : {
    __bss_start = .;
    *(.bss .bss.*) *(COMMON)
    __bss_end = .;
  }
  __bss_size = __bss_end - __bss_start;
  /DISCARD/ : { *(.note.*) *(.comment) }
}
