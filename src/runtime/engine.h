#pragma once
#include "program.h"

namespace program {
struct Clock {
    virtual ~Clock() = default;
    virtual uint32_t millisNow() const = 0;
    virtual uint32_t microsNow() const = 0;
};
enum class EngineState : uint8_t { Running, Completed, Stopped, Error };
class Engine {
public:
    Engine(Devices &devices, Clock &clock, bool (*stopRequested)(void *), void *context);
    void start(const Program &program);
    void tick();
    void stop();
    EngineState state() const { return state_; }
    const Error &error() const { return error_; }
    uint8_t lastSteps() const { return steps_; }
    // The sensor node the running program is waiting on for a usable value, or nullptr.
    const Node *sensorWait() const {
        return state_ == EngineState::Running && sensorWait_ != NONE ? &program_->nodes[sensorWait_] : nullptr;
    }
private:
    enum class Code : uint8_t { Value, Unary, Binary, ShortCircuit, Set, Wait, Jump, IfFalse, RepeatBegin, RepeatEnd };
    struct Instruction { Code code; uint16_t node; uint16_t target; };
    static constexpr size_t MAX_CODE = MAX_NODES * 4;
    Instruction code_[MAX_CODE];
    double values_[MAX_DEPTH + 1];
    uint32_t repeats_[MAX_DEPTH + 1];
    uint16_t codeSize_ = 0, pc_ = 0, sensorWait_ = NONE;
    uint8_t valueSize_ = 0, repeatSize_ = 0, steps_ = 0;
    bool waiting_ = false;
    uint32_t waitAt_ = 0, waitMs_ = 0;
    Devices &devices_;
    Clock &clock_;
    bool (*stopRequested_)(void *);
    void *context_;
    const Program *program_ = nullptr;
    EngineState state_ = EngineState::Stopped;
    Error error_;
    uint16_t emit(Code code, uint16_t node, uint16_t target = 0);
    void compileBody(uint16_t first);
    void compileExpression(uint16_t index);
    void fail(const char *code, const char *message, uint16_t node);
    void execute(const Instruction &instruction);
};
}
