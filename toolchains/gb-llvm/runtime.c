/* gb-llvm's compiler-rt has no 8- or 16-bit division, and its multiplies
 * shift a signed operand right, so they never end when it is negative.
 * These replace them. */

#include <stdint.h>

#define MUL(name, T)                                                           \
  T name(T lhs, T rhs) {                                                       \
    T sum = 0;                                                                 \
    for (; lhs; lhs >>= 1, rhs <<= 1)                                          \
      if (lhs & 1)                                                             \
        sum += rhs;                                                            \
    return sum;                                                                \
  }

MUL(__mulqi3, uint8_t)
MUL(__mulhi3, uint16_t)
MUL(__mulsi3, uint32_t)

static uint16_t udivmod16(uint16_t n, uint16_t d, uint16_t *rem) {
  uint16_t q = 0, r = 0;
  for (int i = 15; i >= 0; i--) {
    r = (r << 1) | ((n >> i) & 1);
    if (r >= d) {
      r -= d;
      q |= (uint16_t)1 << i;
    }
  }
  *rem = r;
  return q;
}

uint16_t __udivhi3(uint16_t n, uint16_t d) {
  uint16_t r;
  return udivmod16(n, d, &r);
}

uint16_t __umodhi3(uint16_t n, uint16_t d) {
  uint16_t r;
  udivmod16(n, d, &r);
  return r;
}

int16_t __divhi3(int16_t n, int16_t d) {
  uint16_t r;
  uint16_t q = udivmod16(n < 0 ? -(uint16_t)n : n, d < 0 ? -(uint16_t)d : d, &r);
  return (n < 0) != (d < 0) ? -q : q;
}

int16_t __modhi3(int16_t n, int16_t d) {
  uint16_t r;
  udivmod16(n < 0 ? -(uint16_t)n : n, d < 0 ? -(uint16_t)d : d, &r);
  return n < 0 ? -r : r;
}

uint8_t __udivqi3(uint8_t n, uint8_t d) { return __udivhi3(n, d); }
uint8_t __umodqi3(uint8_t n, uint8_t d) { return __umodhi3(n, d); }
int8_t __divqi3(int8_t n, int8_t d) { return __divhi3(n, d); }
int8_t __modqi3(int8_t n, int8_t d) { return __modhi3(n, d); }
