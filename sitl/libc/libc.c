/* Kleine C-Bibliothek für den WebAssembly-Bau von Betaflight. Eigener Code, nur was Betaflight braucht.
   Ausgaben (printf) gehen ins Leere, Gleitkommazahlen in snprintf werden nur einfach unterstützt. */
#include <stddef.h>
#include <stdint.h>
#include <stdarg.h>
#include <stdbool.h>
#include "string.h"
#include "stdlib.h"
#include "ctype.h"
#include "stdio.h"

int errno;

void *memcpy(void *d, const void *s, size_t n) { unsigned char *a = d; const unsigned char *b = s; while (n--) *a++ = *b++; return d; }
void *memmove(void *d, const void *s, size_t n) {
  unsigned char *a = d; const unsigned char *b = s;
  if (a < b) while (n--) *a++ = *b++; else { a += n; b += n; while (n--) *--a = *--b; }
  return d;
}
void *memset(void *d, int c, size_t n) { unsigned char *a = d; while (n--) *a++ = (unsigned char)c; return d; }
int memcmp(const void *x, const void *y, size_t n) { const unsigned char *a = x, *b = y; for (; n; n--, a++, b++) if (*a != *b) return *a - *b; return 0; }
void *memchr(const void *s, int c, size_t n) { const unsigned char *a = s; for (; n; n--, a++) if (*a == (unsigned char)c) return (void *)a; return 0; }
size_t strlen(const char *s) { size_t n = 0; while (s[n]) n++; return n; }
size_t strnlen(const char *s, size_t m) { size_t n = 0; while (n < m && s[n]) n++; return n; }
char *strcpy(char *d, const char *s) { char *r = d; while ((*d++ = *s++)); return r; }
char *strncpy(char *d, const char *s, size_t n) { size_t i = 0; for (; i < n && s[i]; i++) d[i] = s[i]; for (; i < n; i++) d[i] = 0; return d; }
char *strcat(char *d, const char *s) { strcpy(d + strlen(d), s); return d; }
char *strncat(char *d, const char *s, size_t n) { char *e = d + strlen(d); while (n-- && *s) *e++ = *s++; *e = 0; return d; }
int strcmp(const char *a, const char *b) { while (*a && *a == *b) { a++; b++; } return (unsigned char)*a - (unsigned char)*b; }
int strncmp(const char *a, const char *b, size_t n) { for (; n; n--, a++, b++) { if (*a != *b || !*a) return (unsigned char)*a - (unsigned char)*b; } return 0; }
/* strcasecmp, strncasecmp, strcasestr stehen in Betaflight (common/string_light.c) */
char *strchr(const char *s, int c) { for (;; s++) { if (*s == (char)c) return (char *)s; if (!*s) return 0; } }
char *strrchr(const char *s, int c) { const char *r = 0; for (;; s++) { if (*s == (char)c) r = s; if (!*s) return (char *)r; } }
char *strstr(const char *h, const char *n) { size_t k = strlen(n); if (!k) return (char *)h; for (; *h; h++) if (!strncmp(h, n, k)) return (char *)h; return 0; }
size_t strspn(const char *s, const char *acc) { size_t n = 0; while (s[n] && strchr(acc, s[n])) n++; return n; }
size_t strcspn(const char *s, const char *rej) { size_t n = 0; while (s[n] && !strchr(rej, s[n])) n++; return n; }
char *strsep(char **sp, const char *delim) { char *s = *sp; if (!s) return 0; char *e = s + strcspn(s, delim); if (*e) { *e = 0; *sp = e + 1; } else *sp = 0; return s; }
char *strtok_r(char *s, const char *delim, char **save) {
  if (!s) s = *save;
  s += strspn(s, delim);
  if (!*s) { *save = s; return 0; }
  char *e = s + strcspn(s, delim);
  if (*e) *e++ = 0;
  *save = e;
  return s;
}

/* strtol, strtoul, atoi stehen in Betaflight (common/strtol.c) */
unsigned long long strtoull(const char *s, char **end, int base) { return strtoul(s, end, base); }
long long strtoll(const char *s, char **end, int base) { return strtol(s, end, base); }
float strtof(const char *s, char **end) {
  while (isspace((unsigned char)*s)) s++;
  int neg = *s == '-'; if (neg || *s == '+') s++;
  double v = 0, f = 1;
  while (isdigit((unsigned char)*s)) v = v*10 + (*s++ - '0');
  if (*s == '.') { s++; while (isdigit((unsigned char)*s)) { f /= 10; v += (*s++ - '0')*f; } }
  if (end) *end = (char *)s;
  return (float)(neg ? -v : v);
}
double atof(const char *s) { return strtof(s, 0); }

static void swapBytes(char *a, char *b, size_t n) { while (n--) { char t = *a; *a++ = *b; *b++ = t; } }
void qsort(void *base, size_t n, size_t size, int (*cmp)(const void *, const void *)) {   // Einfügesortierung, reicht für kleine Listen
  char *p = base;
  for (size_t i = 1; i < n; i++) for (size_t j = i; j > 0 && cmp(p + (j - 1)*size, p + j*size) > 0; j--) swapBytes(p + (j - 1)*size, p + j*size, size);
}
void *bsearch(const void *key, const void *base, size_t n, size_t size, int (*cmp)(const void *, const void *)) {
  const char *p = base; size_t lo = 0, hi = n;
  while (lo < hi) { size_t mid = (lo + hi)/2; int c = cmp(key, p + mid*size); if (!c) return (void *)(p + mid*size); if (c < 0) hi = mid; else lo = mid + 1; }
  return 0;
}
_Noreturn void abort(void) { __builtin_trap(); }
_Noreturn void exit(int code) { (void)code; __builtin_trap(); }

/* snprintf: %d %i %u %x %X %c %s %f %%, mit Breite, Füllzeichen 0, - und Länge l/ll/h (Länge wird ignoriert außer ll). */
typedef struct { char *b; size_t n, i; } out_t;
static void put(out_t *o, char c) { if (o->i + 1 < o->n) o->b[o->i] = c; o->i++; }
static void putNum(out_t *o, unsigned long long v, int base, int upper, int neg, int width, char pad, int left) {
  char t[24]; int k = 0;
  do { int d = (int)(v % base); t[k++] = (char)(d < 10 ? '0' + d : (upper ? 'A' : 'a') + d - 10); v /= base; } while (v);
  int len = k + neg;
  if (!left && pad == '0' && neg) put(o, '-');
  if (!left) for (; len < width; width--) put(o, pad);
  if (neg && !(pad == '0')) put(o, '-');
  if (neg && left) {}
  while (k) put(o, t[--k]);
  if (left) for (; len < width; width--) put(o, ' ');
}
int vsnprintf(char *b, size_t n, const char *f, va_list a) {
  out_t o = { b, n, 0 };
  for (; *f; f++) {
    if (*f != '%') { put(&o, *f); continue; }
    f++;
    int left = 0, width = 0, prec = -1, ll = 0; char pad = ' ';
    if (*f == '-') { left = 1; f++; }
    if (*f == '0') { pad = '0'; f++; }
    while (isdigit((unsigned char)*f)) width = width*10 + (*f++ - '0');
    if (*f == '.') { f++; prec = 0; while (isdigit((unsigned char)*f)) prec = prec*10 + (*f++ - '0'); }
    while (*f == 'l' || *f == 'h' || *f == 'z') { if (*f == 'l') ll++; f++; }
    switch (*f) {
      case 'd': case 'i': { long long v = ll > 1 ? va_arg(a, long long) : va_arg(a, int); putNum(&o, v < 0 ? -v : v, 10, 0, v < 0, width, pad, left); break; }
      case 'u': putNum(&o, ll > 1 ? va_arg(a, unsigned long long) : va_arg(a, unsigned), 10, 0, 0, width, pad, left); break;
      case 'x': case 'X': putNum(&o, ll > 1 ? va_arg(a, unsigned long long) : va_arg(a, unsigned), 16, *f == 'X', 0, width, pad, left); break;
      case 'c': put(&o, (char)va_arg(a, int)); break;
      case 's': { const char *s = va_arg(a, const char *); if (!s) s = "(null)"; int len = (int)strlen(s); if (prec >= 0 && len > prec) len = prec;
                  if (!left) for (int w = len; w < width; w++) put(&o, ' ');
                  for (int i = 0; i < len; i++) put(&o, s[i]);
                  if (left) for (int w = len; w < width; w++) put(&o, ' '); break; }
      case 'f': { double v = va_arg(a, double); if (prec < 0) prec = 6; int neg = v < 0; if (neg) v = -v;
                  double sc = 1; for (int i = 0; i < prec; i++) sc *= 10;
                  unsigned long long w = (unsigned long long)(v*sc + 0.5), ip = (unsigned long long)(w/sc), fp = w - (unsigned long long)(ip*sc);
                  putNum(&o, ip, 10, 0, neg, 0, ' ', 0);
                  if (prec) { put(&o, '.'); char t[24]; int k = 0; for (int i = 0; i < prec; i++) { t[k++] = (char)('0' + fp % 10); fp /= 10; } while (k) put(&o, t[--k]); }
                  break; }
      case '%': put(&o, '%'); break;
      default: put(&o, '%'); put(&o, *f); break;
    }
  }
  if (n) b[o.i < n ? o.i : n - 1] = 0;
  return (int)o.i;
}
int snprintf(char *b, size_t n, const char *f, ...) { va_list a; va_start(a, f); int r = vsnprintf(b, n, f, a); va_end(a); return r; }
int sprintf(char *b, const char *f, ...) { va_list a; va_start(a, f); int r = vsnprintf(b, (size_t)-1/2, f, a); va_end(a); return r; }
int printf(const char *f, ...) { (void)f; return 0; }

FILE *stderr, *stdout;
int fprintf(FILE *fp, const char *f, ...) { (void)fp; (void)f; return 0; }
int puts(const char *s) { (void)s; return 0; }
int putchar(int c) { return c; }
FILE *fopen(const char *name, const char *mode) { (void)name; (void)mode; return 0; }
int fclose(FILE *fp) { (void)fp; return 0; }
size_t fread(void *p, size_t size, size_t n, FILE *fp) { (void)p; (void)size; (void)n; (void)fp; return 0; }
size_t fwrite(const void *p, size_t size, size_t n, FILE *fp) { (void)p; (void)size; (void)fp; return n; }
int fseek(FILE *fp, long off, int whence) { (void)fp; (void)off; (void)whence; return -1; }
long ftell(FILE *fp) { (void)fp; return 0; }
void rewind(FILE *fp) { (void)fp; }
int fflush(FILE *fp) { (void)fp; return 0; }
char *fgets(char *s, int n, FILE *fp) { (void)s; (void)n; (void)fp; return 0; }
int fputs(const char *s, FILE *fp) { (void)s; (void)fp; return 0; }
void perror(const char *s) { (void)s; }

/* Für Dateien, die fminf/fmaxf ohne math.h deklarieren */
float fminf(float a, float b) { return a != a ? b : b != b ? a : a < b ? a : b; }
float fmaxf(float a, float b) { return a != a ? b : b != b ? a : a > b ? a : b; }
