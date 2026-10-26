#include "device_settings.h"

#include <cstdarg>
#include <cstdio>
#include <cstring>

namespace
{
    struct TypeEntry
    {
        PartType type;
        const char *key;
        const char *name;
        bool i2c;
    };
    // PartTypeの並びと同じ順にする。
    const TypeEntry kTypes[] = {
        {PartType::Led, "led", "LED", false},
        {PartType::Buzzer, "buzzer", "ブザー", false},
        {PartType::Thermo, "thermo", "温度センサ", true},
        {PartType::Tof, "tof", "距離センサ", true},
    };

    const TypeEntry &typeEntry(PartType type)
    {
        return kTypes[static_cast<uint8_t>(type)];
    }

    bool fail(char *message, size_t size, const char *format, ...)
    {
        va_list args;
        va_start(args, format);
        vsnprintf(message, size, format, args);
        va_end(args);
        return false;
    }

    bool candidatePin(uint8_t pin)
    {
        for (const uint8_t candidate : CANDIDATE_PINS)
            if (candidate == pin)
                return true;
        return false;
    }

    // ブロックのJSONやURLにそのまま載せられる形に限る。
    bool validId(const char *id)
    {
        if (*id < 'a' || *id > 'z')
            return false;
        for (const char *c = id; *c; ++c)
            if (!((*c >= 'a' && *c <= 'z') || (*c >= '0' && *c <= '9') || *c == '_'))
                return false;
        return true;
    }

    bool blank(const char *text)
    {
        for (; *text; ++text)
            if (*text != ' ' && *text != '\t')
                return false;
        return true;
    }

    // 長さを確かめてからコピーする。途中にNULを含む文字列も受け付けない。
    bool copyString(JsonVariantConst value, char *out, size_t capacity)
    {
        if (!value.is<const char *>())
            return false;
        const JsonString text = value.as<JsonString>();
        if (text.size() > capacity || strlen(text.c_str()) != text.size())
            return false;
        memcpy(out, text.c_str(), text.size());
        out[text.size()] = '\0';
        return true;
    }

    void setPart(PartConfig &part, const char *id, const char *label, PartType type, uint8_t first, uint8_t second = 0)
    {
        part = PartConfig{};
        strncpy(part.id, id, MAX_PART_ID);
        strncpy(part.label, label, MAX_PART_LABEL);
        part.type = type;
        part.pins[0] = first;
        part.pins[1] = second;
    }
}

bool isI2cPart(PartType type)
{
    return typeEntry(type).i2c;
}

const char *partTypeName(PartType type)
{
    return typeEntry(type).name;
}

const char *partTypeKey(PartType type)
{
    return typeEntry(type).key;
}

void defaultPartList(PartList &out)
{
    out.count = 0;
    setPart(out.parts[out.count++], "led_white", "白色LED", PartType::Led, 18);
    setPart(out.parts[out.count++], "led_red", "赤色LED", PartType::Led, 5);
    setPart(out.parts[out.count++], "led_green", "緑色LED", PartType::Led, 17);
    setPart(out.parts[out.count++], "led_yellow", "黄色LED", PartType::Led, 16);
    setPart(out.parts[out.count++], "led_blue", "青色LED", PartType::Led, 4);
    setPart(out.parts[out.count++], "buzzer", "ブザー", PartType::Buzzer, 23);
    setPart(out.parts[out.count++], "temperature", "温度", PartType::Thermo, 21, 22);
    setPart(out.parts[out.count++], "distance", "距離", PartType::Tof, 21, 22);
}

bool readPartList(JsonVariantConst json, PartList &out, char *message, size_t size)
{
    const JsonArrayConst parts = json["parts"].as<JsonArrayConst>();
    if (parts.isNull())
        return fail(message, size, "部品リスト（parts）が必要です。");
    if (parts.size() > MAX_PARTS)
        return fail(message, size, "部品は%u個まで登録できます。", static_cast<unsigned>(MAX_PARTS));

    out.count = 0;
    for (const JsonVariantConst value : parts)
    {
        PartConfig &part = out.parts[out.count];
        part = PartConfig{};
        if (!value.is<JsonObjectConst>())
            return fail(message, size, "部品の形式が不正です。");
        if (!copyString(value["id"], part.id, MAX_PART_ID))
            return fail(message, size, "部品IDが不正です。");
        if (!copyString(value["label"], part.label, MAX_PART_LABEL))
            return fail(message, size, "部品の名前が長すぎるか、不正です。");

        const char *type = value["type"].as<const char *>();
        const TypeEntry *found = nullptr;
        for (const TypeEntry &entry : kTypes)
            if (type && strcmp(type, entry.key) == 0)
                found = &entry;
        if (!found)
            return fail(message, size, "「%s」の種類が不正です。", part.label);
        part.type = found->type;

        const JsonArrayConst pins = value["pins"].as<JsonArrayConst>();
        const size_t expected = found->i2c ? 2 : 1;
        if (pins.isNull() || pins.size() != expected)
            return fail(message, size, "「%s」のピンを選んでください。", part.label);
        for (size_t i = 0; i < expected; ++i)
        {
            const JsonVariantConst pin = pins[i];
            if (!pin.is<int>() || pin.as<int>() < 0 || pin.as<int>() > 255)
                return fail(message, size, "「%s」のピンが不正です。", part.label);
            part.pins[i] = static_cast<uint8_t>(pin.as<int>());
        }
        ++out.count;
    }
    return validatePartList(out, message, size);
}

bool validatePartList(const PartList &list, char *message, size_t size)
{
    if (list.count > MAX_PARTS)
        return fail(message, size, "部品は%u個まで登録できます。", static_cast<unsigned>(MAX_PARTS));

    // ピンごとの使われ方。roleは0=LED・ブザー、1=SDA、2=SCL。
    struct Use
    {
        int8_t role = -1;
        uint8_t sda = 0, scl = 0;
        const char *label = nullptr;
    } uses[40];
    struct Bus
    {
        uint8_t sda, scl;
        bool thermo, tof;
    } buses[MAX_I2C_BUSES];
    size_t busCount = 0;

    for (size_t i = 0; i < list.count; ++i)
    {
        const PartConfig &part = list.parts[i];
        if (!validId(part.id))
            return fail(message, size, "部品ID「%s」が不正です。", part.id);
        if (blank(part.label))
            return fail(message, size, "名前が空の部品があります。");
        for (size_t j = 0; j < i; ++j)
        {
            if (strcmp(list.parts[j].id, part.id) == 0)
                return fail(message, size, "部品ID「%s」が重なっています。", part.id);
            if (strcmp(list.parts[j].label, part.label) == 0)
                return fail(message, size, "「%s」という名前が重なっています。", part.label);
        }

        const bool i2c = isI2cPart(part.type);
        if (i2c && part.pins[0] == part.pins[1])
            return fail(message, size, "「%s」のSDAとSCLには別のピンを選んでください。", part.label);
        for (size_t k = 0; k < (i2c ? 2u : 1u); ++k)
        {
            const uint8_t pin = part.pins[k];
            if (!candidatePin(pin))
                return fail(message, size, "「%s」のGPIO%uは使えないピンです。", part.label, static_cast<unsigned>(pin));
            Use &use = uses[pin];
            const int8_t role = i2c ? static_cast<int8_t>(1 + k) : 0;
            if (use.role < 0)
            {
                use.role = role;
                use.sda = part.pins[0];
                use.scl = part.pins[1];
                use.label = part.label;
                continue;
            }
            // 同じSDA・SCLの組を使うI2C部品だけは、ピンを共有できる。
            if (!(i2c && use.role == role && use.sda == part.pins[0] && use.scl == part.pins[1]))
                return fail(message, size, "GPIO%uが「%s」と「%s」で重なっています。", static_cast<unsigned>(pin), use.label, part.label);
        }

        if (!i2c)
            continue;
        Bus *bus = nullptr;
        for (size_t b = 0; b < busCount; ++b)
            if (buses[b].sda == part.pins[0] && buses[b].scl == part.pins[1])
                bus = &buses[b];
        if (!bus)
        {
            if (busCount >= MAX_I2C_BUSES)
                return fail(message, size, "I2C（SDA・SCLの組）は%u組までです。", static_cast<unsigned>(MAX_I2C_BUSES));
            bus = &buses[busCount++];
            *bus = Bus{part.pins[0], part.pins[1], false, false};
        }
        bool &present = part.type == PartType::Thermo ? bus->thermo : bus->tof;
        if (present)
            return fail(message, size, "同じI2C（SDA GPIO%u / SCL GPIO%u）に%sは1個までです。",
                        static_cast<unsigned>(bus->sda), static_cast<unsigned>(bus->scl), partTypeName(part.type));
        present = true;
    }
    return true;
}

void writePartList(JsonVariant root, const PartList &list)
{
    JsonArray parts = root["parts"].to<JsonArray>();
    for (size_t i = 0; i < list.count; ++i)
    {
        const PartConfig &part = list.parts[i];
        JsonObject entry = parts.add<JsonObject>();
        // 配列の文字列は静的とみなされうるので、明示的にコピーさせる。
        entry["id"] = JsonString(part.id, false);
        entry["type"] = partTypeKey(part.type);
        entry["label"] = JsonString(part.label, false);
        JsonArray pins = entry["pins"].to<JsonArray>();
        for (size_t k = 0; k < (isI2cPart(part.type) ? 2u : 1u); ++k)
            pins.add(part.pins[k]);
    }
}

void writeCandidatePins(JsonVariant root)
{
    JsonArray pins = root["candidatePins"].to<JsonArray>();
    for (const uint8_t pin : CANDIDATE_PINS)
        pins.add(pin);
}
