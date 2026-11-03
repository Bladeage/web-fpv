#pragma once
#include <stddef.h>
#include <stdarg.h>
/* Ausgaben gehen ins Leere, Dateien gibt es nicht (alle Datei-Funktionen melden Fehler) */
typedef struct FILE FILE;
extern FILE *stderr, *stdout;
#define SEEK_SET 0
#define SEEK_CUR 1
#define SEEK_END 2
#define EOF (-1)
int printf(const char *f, ...);
int fprintf(FILE *fp, const char *f, ...);
int snprintf(char *b, size_t n, const char *f, ...);
int sprintf(char *b, const char *f, ...);
int vsnprintf(char *b, size_t n, const char *f, va_list a);
int puts(const char *s);
int putchar(int c);
FILE *fopen(const char *name, const char *mode);
int fclose(FILE *fp);
size_t fread(void *p, size_t size, size_t n, FILE *fp);
size_t fwrite(const void *p, size_t size, size_t n, FILE *fp);
int fseek(FILE *fp, long off, int whence);
long ftell(FILE *fp);
void rewind(FILE *fp);
int fflush(FILE *fp);
char *fgets(char *s, int n, FILE *fp);
int fputs(const char *s, FILE *fp);
void perror(const char *s);
