#pragma once
#include <ArduinoJson.h>
#include <stddef.h>
#include <stdint.h>

// 部品リストの設定。最初からつながっているキットの部品も、後から足した部品も同じ形で持つ。
// Arduinoに依存させず、ホストのUnityテストでも検証できるようにする。
// 画面側も同じ規則で先に確かめる（frontend/src/settings/rules.ts）。設計はadr/0009を参照。

enum class PartType : uint8_t
{
    Led,
    Buzzer,
    Thermo, // AMG8833（I2C）
    Tof,    // VL53L1X（I2C）
};

constexpr size_t MAX_PARTS = 32; // 変化の印を1つのuint32_tで持つため
constexpr size_t MAX_PART_ID = 23;
constexpr size_t MAX_PART_LABEL = 48; // UTF-8のバイト数
// SDA・SCLの組が同じI2C部品は、同じバスに並べてつなぐ。
// センサの読み取りがまだ1系統（Wire）だけに対応しているため1。
constexpr size_t MAX_I2C_BUSES = 1;

// 部品に使ってよいピン。0/1/3（書き込み・シリアル）、6〜11（フラッシュ）、
// 12（起動電圧の切り替え）、34〜39（入力専用）は外す。
constexpr uint8_t CANDIDATE_PINS[] = {2, 4, 5, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33};

struct PartConfig
{
    char id[MAX_PART_ID + 1] = {};
    char label[MAX_PART_LABEL + 1] = {};
    PartType type = PartType::Led;
    uint8_t pins[2] = {}; // LED・ブザーは[0]だけ。センサは[SDA, SCL]
};

struct PartList
{
    PartConfig parts[MAX_PARTS];
    uint8_t count = 0;
};

bool isI2cPart(PartType type);
const char *partTypeName(PartType type);

// 設定が保存されていないときに使う、最初のキットの部品リスト。
void defaultPartList(PartList &out);

// `{"parts":[{id,type,label,pins}]}`を読み、検証まで行う。
// 失敗したときは`message`に画面へそのまま出せる理由を書く。
bool readPartList(JsonVariantConst json, PartList &out, char *message, size_t size);
bool validatePartList(const PartList &list, char *message, size_t size);

// `parts`と`candidatePins`を書く。文字列はコピーするので、listを先に破棄してよい。
void writePartList(JsonVariant root, const PartList &list);
void writeCandidatePins(JsonVariant root);
