#pragma once
#define M_PIf 3.14159265358979323846f
#define M_PI 3.14159265358979323846
#define M_E 2.7182818284590452354
#define M_LN2f 0.69314718055994530942f
#define M_LN2 0.69314718055994530942
#define M_SQRT2 1.41421356237309504880
#define INFINITY __builtin_inff()
#define NAN __builtin_nanf("")
#define HUGE_VALF __builtin_huge_valf()
#define isnan(x) __builtin_isnan(x)
#define isinf(x) __builtin_isinf(x)
#define isfinite(x) __builtin_isfinite(x)
#define signbit(x) __builtin_signbit(x)
/* direkt als WebAssembly-Befehl */
static inline float sqrtf(float x) { return __builtin_sqrtf(x); }
static inline double sqrt(double x) { return __builtin_sqrt(x); }
static inline float fabsf(float x) { return __builtin_fabsf(x); }
static inline double fabs(double x) { return __builtin_fabs(x); }
static inline float floorf(float x) { return __builtin_floorf(x); }
static inline double floor(double x) { return __builtin_floor(x); }
static inline float ceilf(float x) { return __builtin_ceilf(x); }
static inline double ceil(double x) { return __builtin_ceil(x); }
static inline float truncf(float x) { return __builtin_truncf(x); }
/* fmin/fmax ausgeschrieben: __builtin_fminf wird in WebAssembly zu einem Aufruf von fminf (NaN-Regeln) */
static inline float fminf(float a, float b) { return a != a ? b : b != b ? a : a < b ? a : b; }
static inline float fmaxf(float a, float b) { return a != a ? b : b != b ? a : a > b ? a : b; }
static inline double fmin(double a, double b) { return a != a ? b : b != b ? a : a < b ? a : b; }
static inline double fmax(double a, double b) { return a != a ? b : b != b ? a : a > b ? a : b; }
static inline float copysignf(float a, float b) { return __builtin_copysignf(a, b); }
static inline float rintf(float x) { return __builtin_rintf(x); }
static inline float nearbyintf(float x) { return __builtin_nearbyintf(x); }
static inline long lrintf(float x) { return (long)__builtin_rintf(x); }
static inline long lrint(double x) { return (long)__builtin_rint(x); }
static inline float roundf(float x) { return __builtin_truncf(x + __builtin_copysignf(0.5f, x)); }
static inline double round(double x) { return __builtin_trunc(x + __builtin_copysign(0.5, x)); }
static inline long lroundf(float x) { return (long)roundf(x); }
static inline float fmodf(float a, float b) { return a - __builtin_truncf(a/b)*b; }
static inline double fmod(double a, double b) { return a - __builtin_trunc(a/b)*b; }
static inline float ldexpf(float x, int e) { while (e > 0) { x *= 2.0f; e--; } while (e < 0) { x *= 0.5f; e++; } return x; }
/* aus JavaScript (Math.*), Import-Modul "math" */
#define JSM(name) __attribute__((import_module("math"), import_name(#name)))
JSM(sin) double sin(double); JSM(cos) double cos(double); JSM(tan) double tan(double);
JSM(asin) double asin(double); JSM(acos) double acos(double); JSM(atan) double atan(double); JSM(atan2) double atan2(double, double);
JSM(exp) double exp(double); JSM(log) double log(double); JSM(log10) double log10(double); JSM(log2) double log2(double);
JSM(pow) double pow(double, double); JSM(cbrt) double cbrt(double); JSM(hypot) double hypot(double, double);
JSM(tanh) double tanh(double);
static inline float sinf(float x) { return (float)sin(x); }
static inline float cosf(float x) { return (float)cos(x); }
static inline float tanf(float x) { return (float)tan(x); }
static inline float asinf(float x) { return (float)asin(x); }
static inline float acosf(float x) { return (float)acos(x); }
static inline float atanf(float x) { return (float)atan(x); }
static inline float atan2f(float y, float x) { return (float)atan2(y, x); }
static inline float expf(float x) { return (float)exp(x); }
static inline float logf(float x) { return (float)log(x); }
static inline float log10f(float x) { return (float)log10(x); }
static inline float log2f(float x) { return (float)log2(x); }
static inline float powf(float a, float b) { return (float)pow(a, b); }
static inline float cbrtf(float x) { return (float)cbrt(x); }
static inline float hypotf(float a, float b) { return (float)hypot(a, b); }
static inline float tanhf(float x) { return (float)tanh(x); }
static inline void sincosf(float x, float *s, float *c) { *s = sinf(x); *c = cosf(x); }
