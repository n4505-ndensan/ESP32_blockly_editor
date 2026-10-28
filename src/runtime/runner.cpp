#include "runner.h"
#include <Arduino.h>
#include <esp_system.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <atomic>

namespace
{
    StaticSemaphore_t mutexBuffer;
    SemaphoreHandle_t mutex;
    class Lock
    {
    public:
        Lock() { xSemaphoreTake(mutex, portMAX_DELAY); }
        ~Lock() { xSemaphoreGive(mutex); }
    };
#ifdef SENSOR_DIAGNOSTICS
    // A change of the run state's waiting. Captured under the runtime mutex, printed outside it.
    struct SensorWaitEvent
    {
        const char *event = nullptr; // "wait", "resume" or "stop"
        int index = -1;
        uint32_t at = 0;
        SensorSample sample;
        uint32_t runId = 0;
        char blockId[program::MAX_BLOCK_ID + 1] = {};
    };
    // A tick can end one wait and start another. publishSensorWait() drains them after every tick.
    SensorWaitEvent sensorWaitEvents[2];
    uint8_t sensorWaitEventCount = 0;
#endif
    class Hardware : public program::Devices
    {
    public:
        int resolve(const char *id, bool output) const override
        {
            const int index = deviceIndexOf(id);
            if (index < 0)
                return -1;
            const auto &d = deviceDescriptor(index);
            return output ? (d.kind == DeviceKind::Output && d.control == DeviceControl::Switch ? index : -1) : (d.kind == DeviceKind::Sensor ? index : -1);
        }
        bool read(int index, double &value) override
        {
            const auto state = deviceState(index);
            value = state.sample.value;
            return sensorValueUsable(state.sample);
        }
        void set(int index, bool on) override { setDeviceOutput(index, on); }
        void allOff() override { turnDeviceOutputsOff(); }
    } hardware;
    class HardwareClock : public program::Clock
    {
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
#ifdef SENSOR_DIAGNOSTICS
    // Under the runtime mutex: capture only, never print here.
    void captureSensorWait(const char *event, uint32_t runId, const char *deviceId, const char *blockId)
    {
        const int index = deviceIndexOf(deviceId);
        if (index < 0 || sensorWaitEventCount == sizeof(sensorWaitEvents) / sizeof(sensorWaitEvents[0]))
            return;
        SensorWaitEvent &captured = sensorWaitEvents[sensorWaitEventCount++];
        captured = SensorWaitEvent{};
        captured.event = event;
        captured.index = index;
        captured.at = millis();
        captured.sample = deviceState(index).sample;
        captured.runId = runId;
        strcpy(captured.blockId, blockId);
    }
#endif
    // Under the runtime mutex. node is the sensor the engine waits on, or nullptr.
    // ended says how the previous wait ended: "resume" (a usable value was read) or "stop".
    void updateSensorWait(const program::Node *node, const char *ended)
    {
        const char *deviceId = node ? deviceDescriptor(node->device).id : nullptr;
#ifdef SENSOR_DIAGNOSTICS
        const auto before = lifecycle.snapshot();
#endif
        if (!lifecycle.setWaiting(deviceId, node ? node->blockId : nullptr))
            return;
#ifdef SENSOR_DIAGNOSTICS
        if (before.waiting.deviceId)
            captureSensorWait(ended, before.runId, before.waiting.deviceId, before.waiting.blockId);
        if (deviceId)
            captureSensorWait("wait", before.runId, deviceId, node->blockId);
#endif
    }
}
void initProgramRuntime()
{
    mutex = xSemaphoreCreateMutexStatic(&mutexBuffer);
    snprintf(bootId, sizeof(bootId), "%08lx%08lx", static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()));
}
const char *programBootId() { return bootId; }
const program::Devices &runtimeDevices() { return hardware; }
uint32_t programStopEpoch()
{
    Lock lock;
    return lifecycle.stopEpoch();
}
bool submitProgram(std::unique_ptr<program::Program> &program, uint32_t stopEpoch, program::RunSnapshot &accepted)
{
    Lock lock;
    if (!lifecycle.acceptStart(stopEpoch))
        return false;
    stopRequested.store(false);
    pending = std::move(program);
    accepted = lifecycle.snapshot();
    return true;
}
program::RunSnapshot requestProgramStop()
{
#ifdef PROGRAM_DIAGNOSTICS
    const uint32_t enteredAt = micros();
#endif
    Lock lock;
#ifdef PROGRAM_DIAGNOSTICS
    if (!stopRequested.load())
        stopRequestedAt = enteredAt;
#endif
    stopRequested.store(true);
    lifecycle.requestStop();
    return lifecycle.snapshot();
}
#ifdef PROGRAM_DIAGNOSTICS
ProgramDiagnostics programDiagnostics()
{
    Lock lock;
    return diagnostics;
}
#endif
program::RunSnapshot programSnapshot()
{
    Lock lock;
    return lifecycle.snapshot();
}
bool setManualDeviceOutput(size_t index, bool on, DeviceSnapshot &confirmed)
{
    Lock lock;
    if (lifecycle.active() || stopRequested.load())
        return false;
    setDeviceOutput(index, on);
    confirmed = snapshotDevices();
    return true;
}
void tickProgram()
{
    // No I2C or JSON work under this mutex. A tick has a 1ms/64-instruction budget.
    Lock lock;
    if (stopRequested.exchange(false))
    {
        engine.stop();
#ifdef PROGRAM_DIAGNOSTICS
        // Includes mutex admission and loop/I2C scheduling, excludes HTTP transit.
        const uint32_t elapsed = micros() - stopRequestedAt;
        if (elapsed > diagnostics.maxStopUs)
            diagnostics.maxStopUs = elapsed;
        ++diagnostics.stopSamples;
#endif
        pending.reset();
        active.reset();
        updateSensorWait(nullptr, "stop");
        lifecycle.finish(program::EngineState::Stopped, program::Error{});
        return;
    }
    if (pending && lifecycle.markRunning())
    {
        active = std::move(pending);
        engine.start(*active);
    }
    if (!active)
        return;
    engine.tick();
    if (engine.state() == program::EngineState::Running)
    {
        updateSensorWait(engine.sensorWait(), "resume");
        return;
    }
    // A wait can end in the same tick as the run, after the value was read.
    updateSensorWait(nullptr, engine.state() == program::EngineState::Stopped ? "stop" : "resume");
    lifecycle.finish(engine.state(), engine.error());
    active.reset();
}
#ifdef SENSOR_DIAGNOSTICS
void publishSensorWait()
{
    SensorWaitEvent events[sizeof(sensorWaitEvents) / sizeof(sensorWaitEvents[0])];
    uint8_t count;
    {
        Lock lock;
        count = sensorWaitEventCount;
        for (uint8_t i = 0; i < count; ++i)
            events[i] = sensorWaitEvents[i];
        sensorWaitEventCount = 0;
    }
    // Run from loop immediately after tick, outside runtime/device locks.
    for (uint8_t i = 0; i < count; ++i)
    {
        const SensorWaitEvent &event = events[i];
        JsonDocument doc;
        doc["ts"] = event.at;
        doc["bootId"] = programBootId();
        doc["event"] = event.event;
        doc["sensor"] = deviceDescriptor(event.index).id;
        doc["runId"] = event.runId;
        doc["blockId"] = JsonString(event.blockId, false);
        doc["status"] = sensorStatusName(event.sample.status);
        doc["sampleUpdatedAtMs"] = event.sample.updatedAt;
        doc["sampleAgeMs"] = uint32_t(event.at - event.sample.updatedAt);
        // On "wait" the stored value is diagnostic only, not a valid reading.
        doc["storedValue"] = event.sample.value;
        Serial.print("SENSOR_RUNTIME ");
        serializeJson(doc, Serial);
        Serial.println();
    }
}
#endif
