#include "engine.h"
#include <cmath>
#include <cstring>

namespace program {
Engine::Engine(Devices &devices, Clock &clock, bool (*stopRequested)(void *), void *context)
    : devices_(devices), clock_(clock), stopRequested_(stopRequested), context_(context) {}

uint16_t Engine::emit(Code code, uint16_t node, uint16_t target) {
    // Each validated AST node emits at most four instructions.
    if (codeSize_ >= MAX_CODE) { fail("program_too_large", "実行命令の上限を超えました。", node); return 0; }
    code_[codeSize_] = {code, node, target};
    return codeSize_++;
}
void Engine::compileExpression(uint16_t index) {
    const Node &n = program_->nodes[index];
    switch (n.kind) {
    case Kind::Not: compileExpression(n.a); emit(Code::Unary, index); break;
    case Kind::Arithmetic: case Kind::Compare:
        compileExpression(n.a); compileExpression(n.b); emit(Code::Binary, index); break;
    case Kind::Logic: {
        compileExpression(n.a);
        const uint16_t branch = emit(Code::ShortCircuit, index);
        compileExpression(n.b); code_[branch].target = codeSize_; break;
    }
    default: emit(Code::Value, index); break;
    }
}
void Engine::compileBody(uint16_t first) {
    for (auto index = first; index != NONE; index = program_->nodes[index].next) {
        const Node &n = program_->nodes[index];
        switch (n.kind) {
        case Kind::Set: emit(Code::Set, index); break;
        case Kind::Wait: emit(Code::Wait, index); break;
        case Kind::If: {
            compileExpression(n.a);
            const uint16_t branch = emit(Code::IfFalse, index);
            compileBody(n.b);
            const uint16_t end = emit(Code::Jump, index);
            code_[branch].target = codeSize_;
            compileBody(n.c); code_[end].target = codeSize_; break;
        }
        case Kind::Repeat: {
            compileExpression(n.a);
            const uint16_t begin = emit(Code::RepeatBegin, index);
            compileBody(n.b); emit(Code::RepeatEnd, index, begin + 1);
            code_[begin].target = codeSize_; break;
        }
        case Kind::While: {
            const uint16_t begin = codeSize_;
            compileExpression(n.a);
            const uint16_t branch = emit(Code::IfFalse, index);
            compileBody(n.b); emit(Code::Jump, index, begin);
            code_[branch].target = codeSize_; break;
        }
        case Kind::Forever: {
            const uint16_t begin = codeSize_;
            compileBody(n.b); emit(Code::Jump, index, begin); break;
        }
        default: break;
        }
    }
}
void Engine::start(const Program &program) {
    program_ = &program; codeSize_ = pc_ = valueSize_ = repeatSize_ = steps_ = 0;
    waiting_ = false; sensorWait_ = NONE; error_ = Error{}; state_ = EngineState::Running;
    devices_.allOff(); compileBody(program.first);
}
void Engine::stop() {
    waiting_ = false; sensorWait_ = NONE; devices_.allOff(); state_ = EngineState::Stopped;
}
void Engine::fail(const char *code, const char *message, uint16_t node) {
    error_ = Error{}; error_.code = code; error_.message = message;
    if (program_ && node < program_->size) strcpy(error_.blockId, program_->nodes[node].blockId);
    waiting_ = false; sensorWait_ = NONE; devices_.allOff(); state_ = EngineState::Error;
}
void Engine::execute(const Instruction &instruction) {
    const Node &n = program_->nodes[instruction.node];
    switch (instruction.code) {
    case Code::Value: {
        double value = n.value;
        if (n.kind == Kind::Sensor && (!devices_.read(n.device, value) || !std::isfinite(value))) {
            // Stay on this instruction with outputs held and read again on the next tick.
            // Nothing has been pushed, so the expression resumes intact (ADR 0011).
            sensorWait_ = instruction.node; return;
        }
        sensorWait_ = NONE;
        values_[valueSize_++] = value; ++pc_; break;
    }
    case Code::Unary: values_[valueSize_ - 1] = !values_[valueSize_ - 1]; ++pc_; break;
    case Code::Binary: {
        const double right = values_[--valueSize_], left = values_[valueSize_ - 1];
        double result = 0;
        switch (n.op) {
        case Op::Add: result = left + right; break;
        case Op::Subtract: result = left - right; break;
        case Op::Multiply: result = left * right; break;
        case Op::Divide:
            if (right == 0) { fail("arithmetic_error", "0で割ることはできません。", instruction.node); return; }
            result = left / right; break;
        case Op::Power: result = std::pow(left, right); break;
        case Op::Equal: result = left == right; break;
        case Op::NotEqual: result = left != right; break;
        case Op::Less: result = left < right; break;
        case Op::LessEqual: result = left <= right; break;
        case Op::Greater: result = left > right; break;
        case Op::GreaterEqual: result = left >= right; break;
        default: break;
        }
        if (!std::isfinite(result)) { fail("arithmetic_error", "計算結果が数値の範囲を超えています。", instruction.node); return; }
        values_[valueSize_ - 1] = result; ++pc_; break;
    }
    case Code::ShortCircuit: {
        const bool left = values_[valueSize_ - 1] != 0;
        if ((n.op == Op::And && !left) || (n.op == Op::Or && left)) pc_ = instruction.target;
        else { --valueSize_; ++pc_; }
        break;
    }
    case Code::Set: devices_.set(n.device, n.value != 0); ++pc_; break;
    case Code::Wait:
        waitAt_ = clock_.millisNow(); waitMs_ = static_cast<uint32_t>(n.value); waiting_ = true; ++pc_; break;
    case Code::Jump: pc_ = instruction.target; break;
    case Code::IfFalse: pc_ = values_[--valueSize_] == 0 ? instruction.target : pc_ + 1; break;
    case Code::RepeatBegin: {
        const double count = values_[--valueSize_];
        if (!validInteger(count)) { fail("invalid_count", "回数は0以上の整数にしてください。", instruction.node); return; }
        if (count == 0) pc_ = instruction.target;
        else { repeats_[repeatSize_++] = static_cast<uint32_t>(count); ++pc_; }
        break;
    }
    case Code::RepeatEnd:
        if (--repeats_[repeatSize_ - 1] > 0) pc_ = instruction.target;
        else { --repeatSize_; ++pc_; }
        break;
    }
}
void Engine::tick() {
    steps_ = 0;
    if (state_ != EngineState::Running) return;
    if (stopRequested_ && stopRequested_(context_)) { stop(); return; }
    if (waiting_) {
        if (static_cast<uint32_t>(clock_.millisNow() - waitAt_) < waitMs_) return;
        waiting_ = false;
    }
    const uint32_t started = clock_.microsNow();
    while (steps_ < 64 && static_cast<uint32_t>(clock_.microsNow() - started) < 1000) {
        if (stopRequested_ && stopRequested_(context_)) { stop(); return; }
        if (pc_ == codeSize_) { state_ = EngineState::Completed; return; }
        ++steps_; execute(code_[pc_]);
        // Even wait(0) yields to the next tick, as does a sensor wait.
        if (state_ != EngineState::Running || waiting_ || sensorWait_ != NONE) return;
    }
}
}
