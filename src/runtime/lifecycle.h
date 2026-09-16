#pragma once
#include "engine.h"

namespace program {
enum class RunStatus : uint8_t { Idle, Starting, Running, Stopping, Completed, Stopped, Error };
struct RunSnapshot {
    RunStatus state = RunStatus::Idle;
    uint32_t revision = 0, runId = 0;
    Error error;
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
        ++state_.runId; state_.error = Error{}; change(RunStatus::Starting); return true;
    }
    void requestStop() { ++stopEpoch_; if (state_.state != RunStatus::Stopped) change(RunStatus::Stopping); }
    bool markRunning() {
        if (state_.state != RunStatus::Starting) return false;
        change(RunStatus::Running); return true;
    }
    void finish(EngineState state, const Error &error) {
        state_.error = error;
        change(state == EngineState::Error ? RunStatus::Error : state == EngineState::Completed ? RunStatus::Completed : RunStatus::Stopped);
    }
    RunSnapshot snapshot() const { return state_; }
};
}
