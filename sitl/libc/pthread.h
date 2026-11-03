#pragma once
typedef int pthread_mutex_t;
typedef int pthread_t;
#define pthread_mutex_lock(m) 0
#define pthread_mutex_unlock(m) 0
#define pthread_mutex_trylock(m) 0
#define pthread_mutex_init(m, a) 0
#define pthread_create(t, a, f, d) 0
