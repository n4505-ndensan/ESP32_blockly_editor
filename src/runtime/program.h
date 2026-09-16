#pragma once

#include <ArduinoJson.h>
#include <stddef.h>
#include <stdint.h>

namespace program {
constexpr size_t MAX_BYTES = 32768;
constexpr uint16_t MAX_NODES = 256;
constexpr uint8_t MAX_DEPTH = 16;
constexpr size_t MAX_BLOCK_ID = 64;
constexpr uint16_t NONE = 0xffff;
constexpr uint32_t MAX_INTEGER = 0x7fffffff;

enum class Kind : uint8_t { Set, Wait, If, Repeat, While, Forever, Number, Boolean, Sensor, Arithmetic, Compare, Logic, Not };
enum class ValueType : uint8_t { Number, Boolean, Statement };
enum class Op : uint8_t { Add, Subtract, Multiply, Divide, Power, Equal, NotEqual, Less, LessEqual, Greater, GreaterEqual, And, Or };
struct Error {
    const char *code = nullptr;
    const char *message = nullptr;
    char blockId[MAX_BLOCK_ID + 1] = {};
};
struct Node {
    Kind kind = Kind::Number;
    ValueType valueType = ValueType::Statement;
    Op op = Op::Add;
    uint16_t next = NONE, a = NONE, b = NONE, c = NONE;
    int device = -1;
    double value = 0;
    char blockId[MAX_BLOCK_ID + 1] = {};
};
struct Program {
    Node nodes[MAX_NODES];
    uint16_t size = 0, first = NONE;
};
// Hardware-independent ports also used by the Unity tests.
struct Devices {
    virtual ~Devices() = default;
    virtual int resolve(const char *id, bool output) const = 0;
    virtual bool read(int device, double &value) = 0;
    virtual void set(int device, bool on) = 0;
    virtual void allOff() = 0;
};
bool validate(JsonVariantConst json, const Devices &devices, Program &out, Error &error);
bool validInteger(double value);
}
