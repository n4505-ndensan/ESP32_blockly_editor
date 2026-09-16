#include "runner.h"
#include <Arduino.h>
#include <esp_system.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <atomic>

namespace {
StaticSemaphore_t mutexBuffer;
SemaphoreHandle_t mutex;
class Lock {
public:
    Lock() { xSemaphoreTake(mutex, portMAX_DELAY); }
    ~Lock() { xSemaphoreGive(mutex); }
};
class Hardware : public program::Devices {
public:
    int resolve(const char *id, bool output) const override {
        const int index = deviceIndexOf(id);
        if (index < 0) return -1;
        const auto &d = deviceDescriptor(index);
        return output ? (d.kind == DeviceKind::Output && d.control == DeviceControl::Switch ? index : -1) : (d.kind == DeviceKind::Sensor ? index : -1);
    }
    bool read(int index, double &value) override {
        const auto state = deviceState(index); value = state.sample.value;
        return state.sample.status == SensorStatus::Ok;
    }
    void set(int index, bool on) override { setDeviceOutput(index, on); }
    void allOff() override { turnDeviceOutputsOff(); }
} hardware;
class HardwareClock : public program::Clock {
public:
    uint32_t millisNow() const override { return millis(); }
    uint32_t microsNow() const override { return micros(); }
} hardwareClock;
std::atomic<bool> stopRequested{false};
bool wantsStop(void *) { return stopRequested.load(); }
program::Engine engine(hardware, hardwareClock, wantsStop, nullptr);
program::Lifecycle lifecycle;
std::unique_ptr<program::Program> pending, active;
char bootId[17];
#ifdef PROGRAM_DIAGNOSTICS
uint32_t stopRequestedAt = 0;
ProgramDiagnostics diagnostics;
#endif
}
void initProgramRuntime() {
    mutex = xSemaphoreCreateMutexStatic(&mutexBuffer);
    snprintf(bootId, sizeof(bootId), "%08lx%08lx", static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()));
}
const char *programBootId() { return bootId; }
const program::Devices &runtimeDevices() { return hardware; }
uint32_t programStopEpoch() { Lock lock; return lifecycle.stopEpoch(); }
bool submitProgram(std::unique_ptr<program::Program> &program, uint32_t stopEpoch, program::RunSnapshot &accepted) {
    Lock lock;
    if (!lifecycle.acceptStart(stopEpoch)) return false;
    stopRequested.store(false); pending = std::move(program); accepted = lifecycle.snapshot(); return true;
}
program::RunSnapshot requestProgramStop() {
#ifdef PROGRAM_DIAGNOSTICS
    const uint32_t enteredAt = micros();
#endif
    Lock lock;
#ifdef PROGRAM_DIAGNOSTICS
    if (!stopRequested.load()) stopRequestedAt = enteredAt;
#endif
    stopRequested.store(true); lifecycle.requestStop(); return lifecycle.snapshot();
}
#ifdef PROGRAM_DIAGNOSTICS
ProgramDiagnostics programDiagnostics() { Lock lock; return diagnostics; }
#endif
program::RunSnapshot programSnapshot() { Lock lock; return lifecycle.snapshot(); }
bool setManualDeviceOutput(size_t index, bool on, DeviceSnapshot &confirmed) {
    Lock lock;
    if (lifecycle.active() || stopRequested.load()) return false;
    setDeviceOutput(index, on); confirmed = snapshotDevices(); return true;
}
void tickProgram() {
    // No I2C or JSON work under this mutex. A tick has a 1ms/64-instruction budget.
    Lock lock;
    if (stopRequested.exchange(false)) {
        engine.stop();
    #ifdef PROGRAM_DIAGNOSTICS
        // Includes mutex admission and loop/I2C scheduling, excludes HTTP transit.
        const uint32_t elapsed = micros() - stopRequestedAt;
        if (elapsed > diagnostics.maxStopUs) diagnostics.maxStopUs = elapsed;
        ++diagnostics.stopSamples;
    #endif
        pending.reset(); active.reset(); lifecycle.finish(program::EngineState::Stopped, program::Error{}); return;
    }
    if (pending && lifecycle.markRunning()) { active = std::move(pending); engine.start(*active); }
    if (!active) return;
    engine.tick();
    if (engine.state() != program::EngineState::Running) {
        lifecycle.finish(engine.state(), engine.error()); active.reset();
    }
}
