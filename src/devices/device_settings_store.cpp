#include "device_settings_store.h"

#include <Arduino.h>
#include <Preferences.h>
#include <memory>
#include <new>

namespace
{
    constexpr const char *kNamespace = "devices";
    constexpr const char *kKey = "parts";
    // 保存形式を変えたら上げる。読めない版は捨てて最初のキットに戻す。
    constexpr int kVersion = 1;

    bool readSaved(Preferences &prefs, PartList &out, char *message, size_t size)
    {
        const size_t length = prefs.getBytesLength(kKey);
        if (length == 0)
            return false;
        std::unique_ptr<char[]> data(new (std::nothrow) char[length]);
        if (!data || prefs.getBytes(kKey, data.get(), length) != length)
        {
            snprintf(message, size, "読み出しに失敗しました。");
            return false;
        }
        JsonDocument doc;
        if (deserializeJson(doc, data.get(), length) || doc["version"].as<int>() != kVersion)
        {
            snprintf(message, size, "形式が違います。");
            return false;
        }
        return readPartList(doc.as<JsonVariantConst>(), out, message, size);
    }
}

void loadPartList(PartList &out)
{
    Preferences prefs;
    char message[160] = {};
    // 一度も保存していなければ名前空間が無い。読み取り専用で開くとエラーログが出るので、
    // 書き込み可で開く（ここでは何も書かない）。
    if (prefs.begin(kNamespace, false))
    {
        const bool loaded = readSaved(prefs, out, message, sizeof(message));
        prefs.end();
        if (loaded)
        {
            Serial.printf("Part list loaded from NVS (%u parts)\n", static_cast<unsigned>(out.count));
            return;
        }
        if (message[0])
            Serial.printf("Saved part list ignored: %s\n", message);
    }
    defaultPartList(out);
    Serial.println("Using the default part list");
}

bool savePartList(const PartList &list)
{
    JsonDocument doc;
    doc["version"] = kVersion;
    writePartList(doc.as<JsonVariant>(), list);
    String json;
    serializeJson(doc, json);

    Preferences prefs;
    if (!prefs.begin(kNamespace, false))
        return false;
    const size_t written = prefs.putBytes(kKey, json.c_str(), json.length());
    prefs.end();
    return written == json.length();
}
