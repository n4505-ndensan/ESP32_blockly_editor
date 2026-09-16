#pragma once
#include <ArduinoJson.h>
#include <cstring>

namespace program {
// Preserve the cursor so ArduinoJson's permissive trailing-data behavior cannot start a malformed request.
class JsonInput {
    const char *data_;
    size_t length_, position_ = 0;
public:
    JsonInput(const char *data, size_t length) : data_(data), length_(length) {}
    int read() { return position_ < length_ ? static_cast<unsigned char>(data_[position_++]) : -1; }
    size_t readBytes(char *out, size_t length) {
        size_t count = length < length_ - position_ ? length : length_ - position_;
        memcpy(out, data_ + position_, count); position_ += count; return count;
    }
    bool whitespaceRemaining() {
        int ch;
        while ((ch = read()) != -1) if (ch != ' ' && ch != '\r' && ch != '\n' && ch != '\t') return false;
        return true;
    }
};
inline DeserializationError parseProgramJson(JsonDocument &doc, const char *data, size_t length) {
    JsonInput input(data, length);
    auto error = deserializeJson(doc, input, DeserializationOption::NestingLimit(64));
    if (!error && !input.whitespaceRemaining()) return DeserializationError::InvalidInput;
    return error;
}
}
