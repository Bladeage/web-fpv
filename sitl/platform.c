/* Plattform für Betaflight als WebAssembly im Browser. Ersetzt src/platform/SIMULATOR/sitl.c.
   Ohne Threads, Netzwerk und Dateien: JavaScript schiebt die Simulationszeit vor, gibt Kreisel, Beschleunigung
   und Funkkanäle hinein und liest die Motorwerte. Teile nach sitl.c (Betaflight), darum GPLv3 wie Betaflight. */
#include <stdbool.h>
#include <stdint.h>
#include <string.h>
#include <math.h>

#include "platform.h"
#include "common/maths.h"
#include "common/utils.h"
#include "build/debug.h"
#include "drivers/io.h"
#include "drivers/dma.h"
#include "drivers/motor_impl.h"
#include "drivers/serial.h"
#include "drivers/system.h"
#include "drivers/time.h"
#include "drivers/pwm_output.h"
#include "drivers/servo_impl.h"
#include "drivers/pwm_output_impl.h"
#include "drivers/light_led.h"
#include "drivers/timer.h"
#include "drivers/accgyro/accgyro_virtual.h"
#include "config/feature.h"
#include "config/config.h"
#include "config/config_streamer.h"
#include "config/config_streamer_impl.h"
#include "config/config_eeprom_impl.h"
#include "scheduler/scheduler.h"
#include "fc/init.h"
#include "fc/rc_modes.h"
#include "fc/runtime_config.h"
#include "pg/rx.h"
#include "pg/motor.h"
#include "rx/rx.h"
#include "sensors/gyro.h"
#include "flight/imu.h"

#define EXPORT(name) __attribute__((export_name(#name)))

/* ---------- Einstellungs-Register (siehe Änderung an pg.h in build.mjs) ---------- */
#include "pg/pg.h"
const pgRegistry_t *pgWasmRegistry[256];
int pgWasmCount;
static const void *pgWasmTpl[256];
static int pgWasmTplCount;
void pgWasmAdd(const pgRegistry_t *reg) { if (pgWasmCount < 256) pgWasmRegistry[pgWasmCount++] = reg; }
void pgWasmAddTemplate(const void *tpl) { if (pgWasmTplCount < 256) pgWasmTpl[pgWasmTplCount++] = tpl; }
bool pgWasmIsTemplate(const void *ptr) { for (int i = 0; i < pgWasmTplCount; i++) if (pgWasmTpl[i] == ptr) return true; return false; }
bool loadEEPROMFromFile(void) { return true; }

/* ---------- Zeit: Simulationszeit in Mikrosekunden, nur JavaScript schiebt sie vor ---------- */
static uint64_t simUs = 1;
uint32_t SystemCoreClock;
uint64_t nanos64_real(void) { return simUs*1000; }
uint64_t micros64_real(void) { return simUs; }
uint64_t millis64_real(void) { return simUs/1000; }
uint64_t micros64(void) { return simUs; }
uint64_t millis64(void) { return simUs/1000; }
uint32_t micros(void) { return (uint32_t)simUs; }
uint32_t millis(void) { return (uint32_t)(simUs/1000); }
int32_t clockCyclesToMicros(int32_t c) { return c/500; }
int32_t clockCyclesTo10thMicros(int32_t c) { return c/50; }
int32_t clockCyclesTo100thMicros(int32_t c) { return c/5; }
uint32_t clockMicrosToCycles(uint32_t us) { return us*500; }
uint32_t getCycleCounter(void) { return (uint32_t)(simUs*500); }
void delayMicroseconds(uint32_t us) { simUs += us; }   // Warten heißt: Zeit springt vor
void delayMicroseconds_real(uint32_t us) { simUs += us; }
void delay(uint32_t ms) { simUs += (uint64_t)ms*1000; }

/* ---------- System ---------- */
void systemInit(void) { SystemCoreClock = 500*1000000; }   // virtuell 500 MHz wie sitl.c
void systemReset(void) {}
void systemResetToBootloader(bootloaderRequestType_e requestType) { UNUSED(requestType); }
void timerInit(void) {}
void failureMode(failureMode_e mode) { UNUSED(mode); }
void indicateFailure(failureMode_e mode, int repeatCount) { UNUSED(mode); UNUSED(repeatCount); }
int lockMainPID(void) { return 0; }
char _estack;
char _Min_Stack_Size;

/* ---------- Motoren und Servos ---------- */
static pwmOutputPort_t wasmMotors[MAX_SUPPORTED_MOTORS];
static pwmOutputPort_t servos[MAX_SUPPORTED_SERVOS];
static float motorsPwm[MAX_SUPPORTED_MOTORS];
static int wasmMotorCount;
static uint16_t idlePulse;
void servoDevInit(const servoDevConfig_t *servoConfig) { UNUSED(servoConfig); for (int i = 0; i < MAX_SUPPORTED_SERVOS; i++) servos[i].enabled = true; }
pwmOutputPort_t *pwmGetMotors(void) { return wasmMotors; }
static float pwmConvertFromExternal(uint16_t v) { return (float)v; }
static uint16_t pwmConvertToExternal(float v) { return (uint16_t)v; }
static bool wasmEnableMotors(void) { return wasmMotorCount > 0; }
static void pwmDisableMotors(void) {}
static bool wasmIsMotorEnabled(unsigned index) { return wasmMotors[index].enabled; }
static void pwmWriteMotor(uint8_t index, float value) { if (index < MAX_SUPPORTED_MOTORS) motorsPwm[index] = value - idlePulse; }
static void pwmWriteMotorInt(uint8_t index, uint16_t value) { pwmWriteMotor(index, (float)value); }
static void pwmShutdownPulsesForAllMotors(void) {}
static void pwmCompleteMotorUpdate(void) {}
void servoWrite(uint8_t index, float value) { UNUSED(index); UNUSED(value); }
static const motorVTable_t vTable = {
  .postInit = motorPostInitNull, .convertExternalToMotor = pwmConvertFromExternal, .convertMotorToExternal = pwmConvertToExternal,
  .enable = wasmEnableMotors, .disable = pwmDisableMotors, .isMotorEnabled = wasmIsMotorEnabled, .decodeTelemetry = motorDecodeTelemetryNull,
  .write = pwmWriteMotor, .writeInt = pwmWriteMotorInt, .updateComplete = pwmCompleteMotorUpdate, .shutdown = pwmShutdownPulsesForAllMotors,
  .requestTelemetry = NULL, .isMotorIdle = NULL, .getMotorIO = NULL,
};
bool motorPwmDevInit(motorDevice_t *device, const motorDevConfig_t *motorConfig, uint16_t _idlePulse) {
  UNUSED(motorConfig);
  if (!device) return false;
  wasmMotorCount = device->count; device->vTable = &vTable; idlePulse = _idlePulse;
  for (int i = 0; i < MAX_SUPPORTED_MOTORS && i < wasmMotorCount; i++) wasmMotors[i].enabled = true;
  return true;
}

/* ---------- Einstellungsspeicher nur im Arbeitsspeicher ---------- */
void configUnlock(void) {}
void configLock(void) {}
configStreamerResult_e configWriteWord(uintptr_t address, config_streamer_buffer_type_t *buffer) {
  if (address >= (uintptr_t)&eepromData[0] && address + sizeof(uint32_t) <= (uintptr_t)ARRAYEND(eepromData)) {
    memcpy((void *)address, buffer, sizeof(uint32_t));
    return CONFIG_RESULT_SUCCESS;
  }
  return CONFIG_RESULT_ADDRESS_INVALID;
}

/* ---------- Ein- und Ausgänge ohne Hardware ---------- */
void IOConfigGPIO(IO_t io, ioConfig_t cfg) { UNUSED(io); UNUSED(cfg); }
void IOHi(IO_t io) { UNUSED(io); }
void IOLo(IO_t io) { UNUSED(io); }
void IOInitGlobal(void) {}
IO_t IOGetByTag(ioTag_t tag) { UNUSED(tag); return NULL; }
void debugInit(void) {}
void unusedPinsInit(void) {}
bool usbCableIsInserted(void) { return false; }
bool usbCableIsActive(void) { return false; }
void EXTIInit(void) {}
void uartPinConfigure(const serialPinConfig_t *pSerialPinConfig) { UNUSED(pSerialPinConfig); }

/* ---------- Schnittstelle zu JavaScript ---------- */
static uint16_t rcCh[SIMULATOR_MAX_RC_CHANNELS];
#define ACC_SCALE (256/9.80665)   // wie sitl.c: 1 g = 256
#define GYRO_SCALE 16.4f          // wie sitl.c: 2000 °/s Messbereich

// Start: Betaflight initialisieren, dann Arm auf AUX1 und Angle auf AUX2 legen (Kanal 5 und 6, über 1700 an)
EXPORT(bf_init) void bf_init(void) {
  for (int i = 0; i < SIMULATOR_MAX_RC_CHANNELS; i++) rcCh[i] = 1500;
  rcCh[2] = 1000; rcCh[4] = 1000; rcCh[5] = 1000;
  systemInit();
  initPhase1();
  motorConfigMutable()->dev.motorProtocol = MOTOR_PROTOCOL_PWM;   // wie SITL: PWM, keine DShot-Hardware
  systemConfigMutable()->powerOnArmingGraceTime = 0;              // keine Startpause, Neustart im Spiel sofort flugbereit
  gyroConfigMutable()->gyroCalibrationDuration = 10;               // Kreisel-Abgleich 0,1 s statt 1,25 s (Simulation rauscht nicht)
  imuConfigMutable()->small_angle = 180;                           // scharf schalten in jeder Lage (wie der eigene Regler)
  initPhase2();
  initPhase3();
  modeActivationCondition_t *arm = modeActivationConditionsMutable(0);
  arm->modeId = BOXARM; arm->auxChannelIndex = 0; arm->range.startStep = CHANNEL_VALUE_TO_STEP(1700); arm->range.endStep = CHANNEL_VALUE_TO_STEP(2100);
  modeActivationCondition_t *ang = modeActivationConditionsMutable(1);
  ang->modeId = BOXANGLE; ang->auxChannelIndex = 1; ang->range.startStep = CHANNEL_VALUE_TO_STEP(1700); ang->range.endStep = CHANNEL_VALUE_TO_STEP(2100);
  analyzeModeActivationConditions();
}
// Funkkanal i (0 = Rollen, 1 = Nicken, 2 = Gas, 3 = Gieren, AETR) in µs 1000..2000
EXPORT(bf_set_rc) void bf_set_rc(int i, int us) { if (i >= 0 && i < SIMULATOR_MAX_RC_CHANNELS) rcCh[i] = (uint16_t)us; }
// Kreisel in °/s (Rollen, Nicken, Gieren im Betaflight-Körpersystem)
EXPORT(bf_set_gyro) void bf_set_gyro(float x, float y, float z) {
  virtualGyroSet(virtualGyroDev, (int16_t)constrainf(x*GYRO_SCALE, -32767, 32767), (int16_t)constrainf(y*GYRO_SCALE, -32767, 32767), (int16_t)constrainf(z*GYRO_SCALE, -32767, 32767));
}
// Beschleunigung in m/s² (gemessen, also ohne Schwerkraft-Ausgleich: liegt still = +9,81 nach oben)
EXPORT(bf_set_acc) void bf_set_acc(float x, float y, float z) {
  virtualAccSet(virtualAccDev, (int16_t)constrainf(x*ACC_SCALE, -32767, 32767), (int16_t)constrainf(y*ACC_SCALE, -32767, 32767), (int16_t)constrainf(z*ACC_SCALE, -32767, 32767));
}
// Zeit um us vorschieben und dabei den Scheduler laufen lassen (alle 50 µs ein Durchlauf).
// Funkpakete alle 2 ms, wie ein Empfänger mit 500 Hz (Schätzung für ExpressLRS).
static uint64_t nextRcUs;
EXPORT(bf_step) void bf_step(int us) {
  const uint64_t end = simUs + (uint64_t)us;
  while (simUs < end) {
    if (simUs >= nextRcUs) { rxUpdateUdpChannels(rcCh, SIMULATOR_MAX_RC_CHANNELS); nextRcUs = simUs + 2000; }
    scheduler(); simUs += 50;
  }
}
// Motor i, 0..1
EXPORT(bf_motor) float bf_motor(int i) { return i >= 0 && i < MAX_SUPPORTED_MOTORS ? motorsPwm[i]/1000.0f : 0; }
// Zustand für Anzeige und Tests: 0 scharf, 1 Gründe gegen Scharfschalten (Bitfeld), 2 Angle aktiv
EXPORT(bf_flag) int bf_flag(int n) {
  if (n == 9) return pgWasmCount;
  if (n == 0) return ARMING_FLAG(ARMED) ? 1 : 0;
  if (n == 1) return (int)getArmingDisableFlags();
  if (n == 2) return FLIGHT_MODE(ANGLE_MODE) ? 1 : 0;
  return 0;
}
