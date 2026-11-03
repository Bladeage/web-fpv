#pragma once
/* Komplexe Zahlen: clang kann _Complex selbst */
#define complex _Complex
#define I (__extension__ 1.0iF)
#define _Complex_I (__extension__ 1.0iF)
static inline float crealf(float _Complex z) { return __real__ z; }
static inline float cimagf(float _Complex z) { return __imag__ z; }
static inline float cabsf(float _Complex z) { return __builtin_sqrtf(__real__ z*__real__ z + __imag__ z*__imag__ z); }
static inline float _Complex conjf(float _Complex z) { return __builtin_complex(__real__ z, -__imag__ z); }
