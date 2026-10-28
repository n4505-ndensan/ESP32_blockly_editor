#pragma once
#include "engine.h"
#include <cstring>

namespace program {
enum class RunStatus : uint8_t { Idle, Starting, Running, Stopping, Completed, Stopped, Error };
struct RunSnapshot {
    RunStatus state = RunStatus::Idle;
    uint32_t revision = 0, runId = 0;
    Error error;
    // Sensor the running program is waiting on. deviceId points to the part list, which lives until reboot.
    struct Waiting {
        const char *deviceId = nullptr;
        char blockId[MAX_BLOCK_ID + 1] = {};
    } waiting;
};
inline const char *statusName(RunStatus state) {
    static const char *names[] = {"idle", "starting", "running", "stopping", "completed", "stopped", "error"};
    return names[static_cast<uint8_t>(state)];
}
// Call under the runner's mutex. Admission is part of the state transition.
class Lifecycle {
    RunSnapshot state_;
    uint32_t stopEpoch_ = 0;
    void change(RunStatus status) { if (state_.state != status) { state_.state = status; ++state_.revision; } }
public:
    bool active() const { return state_.state == RunStatus::Starting || state_.state == RunStatus::Running || state_.state == RunStatus::Stopping; }
    uint32_t stopEpoch() const { return stopEpoch_; }
    bool acceptStart() { return acceptStart(stopEpoch_); }
    bool acceptStart(uint32_t expectedStopEpoch) {
        if (active() || expectedStopEpoch != stopEpoch_) return false;
        ++state_.runId; state_.error = Error{}; state_.waiting = RunSnapshot::Waiting{};
        change(RunStatus::Starting); return true;
    }
    void requestStop() { ++stopEpoch_; if (state_.state != RunStatus::Stopped) change(RunStatus::Stopping); }
    bool markRunning() {
        if (state_.state != RunStatus::Starting) return false;
        change(RunStatus::Running); return true;
    }
    // Returns true when the waiting sensor changed. Pass nullptr when not waiting.
    bool setWaiting(const char *deviceId, const char *blockId) {
        if (!deviceId) blockId = "";
        const char *current = state_.waiting.deviceId;
        const bool sameDevice = current == deviceId || (current && deviceId && strcmp(current, deviceId) == 0);
        if (sameDevice && strcmp(state_.waiting.blockId, blockId) == 0) return false;
        state_.waiting.deviceId = deviceId; strcpy(state_.waiting.blockId, blockId); ++state_.revision;
        return true;
    }
    void finish(EngineState state, const Error &error) {
        state_.error = error; state_.waiting = RunSnapshot::Waiting{};
        change(state == EngineState::Error ? RunStatus::Error : state == EngineState::Completed ? RunStatus::Completed : RunStatus::Stopped);
    }
    RunSnapshot snapshot() const { return state_; }
};
}
