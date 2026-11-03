#pragma once
/* isalnum, isdigit, isupper, islower, isspace, tolower, toupper stehen in Betaflight (common/string_light.c) */
int isalnum(int c); int isdigit(int c); int isupper(int c); int islower(int c); int isspace(int c); int tolower(int c); int toupper(int c);
static inline int isalpha(int c) { return (c|32) >= 'a' && (c|32) <= 'z'; }
static inline int isxdigit(int c) { return (c >= '0' && c <= '9') || ((c|32) >= 'a' && (c|32) <= 'f'); }
static inline int isprint(int c) { return c >= 32 && c < 127; }
static inline int ispunct(int c) { return isprint(c) && !isalnum(c) && c != ' '; }
