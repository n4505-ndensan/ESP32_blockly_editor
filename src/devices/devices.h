#ifndef DEVICES_H
#define DEVICES_H

#include <Arduino.h>

// 部品の種別。操作できるかどうかの大分類。
enum class DeviceKind : uint8_t
{
    Output, // ON/OFFできる部品
    Sensor, // 値を読むだけの部品
};

// 部品に許す操作。将来Level(PWM)やTone(音階)を足す余地を残す。
enum class DeviceControl : uint8_t
{
    None,
    Switch,
};

// 部品の定義。ここが「どんな部品が存在するか」の唯一の定義になる。
// 操作UIも将来のBlocklyのツールボックスも、この内容から組み立てる。
struct DeviceDescriptor
{
    const char *id;
    const char *label;
    const char *description; // 画面に出す短い補足
    const char *unit;        // センサのみ。出力部品は空文字。
    DeviceKind kind;
    DeviceControl control;
    uint8_t pin;      // 出力部品のみ
    bool activeLow;   // LOWでONになる配線ならtrue
    float epsilon;    // センサのみ。この幅を超えて動いたら変化とみなす
    float (*read)();  // センサのみ。値の読み取り
};

struct DeviceState
{
    bool on;
    float value;
};

// 全部品のピン設定と初期化を行い、状態をOFFにそろえる。
void initDevices();

size_t deviceCount();
const DeviceDescriptor &deviceDescriptor(size_t index);
const DeviceState &deviceState(size_t index);

// 見つからなければ-1を返す。
int deviceIndexOf(const char *id);

// 出力部品をON/OFFする。手動操作もAST実行も必ずここを通す。
// 状態が変わったときだけtrueを返す。
bool setDeviceOutput(size_t index, bool on);

// センサを読み、epsilonを超えて動いた部品に変化の印を付ける。
void pollDeviceSensors();

// 前回の取得以降に変化した部品のビット列を返し、内部の印を落とす。
uint32_t takeChangedDevices();

// 全部品を指すビット列。スナップショットの送信に使う。
uint32_t allDevicesMask();

#endif
