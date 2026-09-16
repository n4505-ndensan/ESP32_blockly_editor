#include "program.h"
#include <cmath>
#include <cstring>

namespace program {
bool validInteger(double value) { return std::isfinite(value) && value >= 0 && value <= MAX_INTEGER && std::floor(value) == value; }
namespace {
class Validator {
    const Devices &devices;
    Program &p;
    Error &error;
    bool fail(const char *message, JsonVariantConst n = JsonVariantConst(), const char *code = "invalid_program") {
        if (error.code) return false;
        error.code = code;
        error.message = message;
        const char *id = n["blockId"].as<const char *>();
        if (id) strncpy(error.blockId, id, MAX_BLOCK_ID);
        return false;
    }
    uint16_t allocate(JsonVariantConst j, uint8_t depth) {
        if (!j.is<JsonObjectConst>()) { fail("ブロックの形式が不正です。"); return NONE; }
        if (p.size >= MAX_NODES || depth > MAX_DEPTH) { fail("プログラムの大きさ・深さが上限を超えています。", j, "program_too_large"); return NONE; }
        JsonString id = j["blockId"].as<JsonString>();
        if (id.isNull() || id.size() == 0 || id.size() > MAX_BLOCK_ID || strlen(id.c_str()) != id.size()) { fail("ブロックIDが不正です。", j); return NONE; }
        const uint16_t index = p.size++;
        p.nodes[index] = Node{};
        memcpy(p.nodes[index].blockId, id.c_str(), id.size());
        return index;
    }
    bool resolve(JsonVariantConst j, Node &n, bool output) {
        JsonString id = j["deviceId"].as<JsonString>();
        if (id.isNull() || strlen(id.c_str()) != id.size() || (n.device = devices.resolve(id.c_str(), output)) < 0)
            return fail("選択した部品はこの操作に対応していません。", j);
        return true;
    }
    bool expect(uint16_t index, ValueType type, JsonVariantConst j) {
        return index != NONE && (p.nodes[index].valueType == type || fail("入力の型が違います。", j));
    }
    bool operation(JsonVariantConst j, Node &n) {
        const char *op = j["op"];
        if (!op) return fail("演算の指定が不正です。", j);
        struct Entry { const char *name; Op op; Kind kind; };
        static const Entry ops[] = {
            {"ADD", Op::Add, Kind::Arithmetic}, {"MINUS", Op::Subtract, Kind::Arithmetic},
            {"MULTIPLY", Op::Multiply, Kind::Arithmetic}, {"DIVIDE", Op::Divide, Kind::Arithmetic}, {"POWER", Op::Power, Kind::Arithmetic},
            {"EQ", Op::Equal, Kind::Compare}, {"NEQ", Op::NotEqual, Kind::Compare}, {"LT", Op::Less, Kind::Compare},
            {"LTE", Op::LessEqual, Kind::Compare}, {"GT", Op::Greater, Kind::Compare}, {"GTE", Op::GreaterEqual, Kind::Compare},
            {"AND", Op::And, Kind::Logic}, {"OR", Op::Or, Kind::Logic}
        };
        for (const auto &entry : ops) if (n.kind == entry.kind && strcmp(op, entry.name) == 0) { n.op = entry.op; return true; }
        return fail("未対応の演算です。", j);
    }
    uint16_t expression(JsonVariantConst j, uint8_t depth) {
        uint16_t index = allocate(j, depth);
        if (index == NONE) return NONE;
        Node &n = p.nodes[index];
        const char *type = j["type"] | "";
        if (strcmp(type, "number") == 0) {
            n.kind = Kind::Number; n.valueType = ValueType::Number;
            if (!j["value"].is<double>() || !std::isfinite(n.value = j["value"].as<double>())) fail("有限の数値を指定してください。", j);
        } else if (strcmp(type, "boolean") == 0) {
            n.kind = Kind::Boolean; n.valueType = ValueType::Boolean;
            if (!j["value"].is<bool>()) fail("真偽値を指定してください。", j);
            n.value = j["value"].as<bool>() ? 1 : 0;
        } else if (strcmp(type, "sensor") == 0) {
            n.kind = Kind::Sensor; n.valueType = ValueType::Number; resolve(j, n, false);
        } else if (strcmp(type, "not") == 0) {
            n.kind = Kind::Not; n.valueType = ValueType::Boolean;
            n.a = expression(j["operand"], depth + 1); expect(n.a, ValueType::Boolean, j);
        } else if (strcmp(type, "arithmetic") == 0 || strcmp(type, "compare") == 0 || strcmp(type, "logic") == 0) {
            n.kind = strcmp(type, "arithmetic") == 0 ? Kind::Arithmetic : strcmp(type, "compare") == 0 ? Kind::Compare : Kind::Logic;
            n.valueType = n.kind == Kind::Arithmetic ? ValueType::Number : ValueType::Boolean;
            if (!operation(j, n)) return NONE;
            n.a = expression(j["left"], depth + 1); if (error.code) return NONE;
            n.b = expression(j["right"], depth + 1); if (error.code) return NONE;
            if (n.kind == Kind::Compare) {
                if (p.nodes[n.a].valueType != p.nodes[n.b].valueType || (p.nodes[n.a].valueType == ValueType::Boolean && n.op != Op::Equal && n.op != Op::NotEqual)) fail("比較する値の型が不正です。", j);
            } else {
                ValueType expected = n.kind == Kind::Arithmetic ? ValueType::Number : ValueType::Boolean;
                expect(n.a, expected, j); expect(n.b, expected, j);
            }
        } else fail("対応していない式です。", j);
        return error.code ? NONE : index;
    }
    uint16_t body(JsonVariantConst j, uint8_t depth) {
        if (!j.is<JsonArrayConst>()) { fail("処理の並びが不正です。"); return NONE; }
        uint16_t first = NONE, previous = NONE;
        for (JsonVariantConst item : j.as<JsonArrayConst>()) {
            uint16_t index = allocate(item, depth);
            if (index == NONE) return NONE;
            if (first == NONE) first = index;
            if (previous != NONE) p.nodes[previous].next = index;
            previous = index;
            Node &n = p.nodes[index];
            const char *type = item["type"] | "";
            if (strcmp(type, "set_output") == 0) {
                n.kind = Kind::Set; resolve(item, n, true);
                if (!item["on"].is<bool>()) fail("ON/OFFの指定が不正です。", item);
                n.value = item["on"].as<bool>() ? 1 : 0;
            } else if (strcmp(type, "wait") == 0) {
                n.kind = Kind::Wait;
                if (!item["ms"].is<double>() || !validInteger(n.value = item["ms"].as<double>())) fail("待機時間が範囲外です。", item);
            } else if (strcmp(type, "if") == 0) {
                n.kind = Kind::If; n.a = expression(item["condition"], depth + 1);
                if (!expect(n.a, ValueType::Boolean, item)) return NONE;
                n.b = body(item["then"], depth + 1); if (error.code) return NONE;
                n.c = body(item["else"], depth + 1);
            } else if (strcmp(type, "repeat") == 0) {
                n.kind = Kind::Repeat; n.a = expression(item["count"], depth + 1);
                if (!expect(n.a, ValueType::Number, item)) return NONE;
                if (p.nodes[n.a].kind == Kind::Number && !validInteger(p.nodes[n.a].value)) { fail("回数は0以上の整数にしてください。", item); return NONE; }
                n.b = body(item["body"], depth + 1);
            } else if (strcmp(type, "while") == 0) {
                n.kind = Kind::While; n.a = expression(item["condition"], depth + 1);
                if (!expect(n.a, ValueType::Boolean, item)) return NONE;
                n.b = body(item["body"], depth + 1);
            } else if (strcmp(type, "forever") == 0) {
                n.kind = Kind::Forever; n.b = body(item["body"], depth + 1);
            } else fail("対応していない処理です。", item);
            if (error.code) return NONE;
        }
        return first;
    }
public:
    Validator(const Devices &d, Program &out, Error &e) : devices(d), p(out), error(e) {}
    bool run(JsonVariantConst j) {
        p.size = 0; error = Error{};
        if (!j.is<JsonObjectConst>() || !j["version"].is<int>() || j["version"].as<int>() != 1) return fail("未対応のプログラム形式です。");
        if (!j["body"].is<JsonArrayConst>() || j["body"].size() == 0) return fail("開始ブロックに処理を接続してください。");
        p.first = body(j["body"], 1);
        return !error.code;
    }
};
}
bool validate(JsonVariantConst json, const Devices &devices, Program &out, Error &error) { return Validator(devices, out, error).run(json); }
}
