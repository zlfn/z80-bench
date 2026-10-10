/* gb-llvm's gb.ld (Apache-2.0 WITH LLVM-exception), changed for the benchmarks
 * to the memory of a cartridge without a mapper: one 32 KB ROM for code and
 * constants, all 8 KB of work RAM for data. The original puts code and
 * constants in separate 16 KB banks and data in the first 4 KB of RAM. */

MEMORY {
  rom (rx)   : ORIGIN = 0x0000, LENGTH = 32K
  vram (rw)  : ORIGIN = 0x8000, LENGTH = 8K
  xram (rwx) : ORIGIN = 0xA000, LENGTH = 8K
  ram (rwx)  : ORIGIN = 0xC000, LENGTH = 8K
  hram (rwx) : ORIGIN = 0xFF80, LENGTH = 127
}

SECTIONS {
  .rst 0x0000 : {
    /* We emulate `call (HL)` with RST00 */
    BYTE(0xE9)    /* JP (HL) */
    . = DEFINED( rst08 ) ? 0x0008 : .; KEEP(*(.text.__gb_rst08))
    . = DEFINED( rst10 ) ? 0x0010 : .; KEEP(*(.text.__gb_rst10))
    . = DEFINED( rst18 ) ? 0x0018 : .; KEEP(*(.text.__gb_rst18))
    . = DEFINED( rst20 ) ? 0x0020 : .; KEEP(*(.text.__gb_rst20))
    . = DEFINED( rst28 ) ? 0x0028 : .; KEEP(*(.text.__gb_rst28))
    . = DEFINED( rst30 ) ? 0x0030 : .; KEEP(*(.text.__gb_rst30))
    . = DEFINED( rst38 ) ? 0x0038 : .; KEEP(*(.text.__gb_rst38))
    . = 0x0040;
  } > rom = 0xd3d3d3d3 /* trap */

  .int 0x0040 : {
    . = 0x0040; KEEP(*(.text.__gb_int_vblank))
    . = 0x0048; KEEP(*(.text.__gb_int_lcd_status))
    . = 0x0050; KEEP(*(.text.__gb_int_timer))
    . = 0x0058; KEEP(*(.text.__gb_int_serial))
    . = 0x0060; KEEP(*(.text.__gb_int_input))
    . = 0x0068;
  } > rom = 0xd3d3d3d3 /* trap */

  .entry 0x0100 : {
    BYTE(0)         /* NOP */
    BYTE(0xC3)      /* JP */
    SHORT(_start)
  } > rom

  .logo 0x0104 : {
    KEEP(*(.logo*))
    . = 0x0134;
  } > rom = 0

  .meta 0x0134 : {
    KEEP(*(.meta*))
    . = 0x0150;
  } > rom = 0

  .hram : { *(.text.hram*), *(.data.hram*) } > hram AT> rom
  .init_array : { KEEP(*(.init_array*)) } > rom
  .fini_array : { KEEP(*(.fini_array*)) } > rom
  .text : { *(.text*) } > rom
  .rodata : { *(.rodata*) } > rom

  . = ORIGIN(ram);
  .bss . (NOLOAD) : { *(.bss*) } > ram
  .data : ALIGN(2) { *(.data*) } > ram AT> rom
}

__gb_data_start = ADDR(.data);
__gb_data_end = __gb_data_start + SIZEOF(.data);
__gb_data_load_addr = LOADADDR(.data);

__gb_hram_start = ADDR(.hram);
__gb_hram_end = __gb_hram_start + SIZEOF(.hram);
__gb_hram_load_addr = LOADADDR(.hram);

__gb_bss_start = ADDR(.bss);
__gb_bss_end = __gb_bss_start + SIZEOF(.bss);
