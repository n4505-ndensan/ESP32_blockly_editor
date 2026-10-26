#ifndef DEVICES_H
#define DEVICES_H

#include <Arduino.h>
#include "device_settings.h"
#include "sensor_sample.h"

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

// 部品の定義。起動時に部品リスト（device_settings.h）から組み立てる。
// 操作UIもBlocklyのツールボックスも、この内容から組み立てる。
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
    uint8_t bus;      // センサのみ。つながっているI2Cの組の番号
    SensorSample (*read)(uint8_t bus);
};

struct DeviceState
{
    bool on = false;
    SensorSample sample;
};
struct DeviceSnapshot {
    DeviceState states[32];
    uint32_t revision;
};

// 保存された部品リスト（無ければ最初のキット）を読み込み、
// 全部品のピン設定と初期化を行い、状態をOFFにそろえる。
void initDevices();

// 起動時に読み込んだ部品リスト。保存し直しても再起動するまで変わらない。
const PartList &activePartList();

size_t deviceCount();
const DeviceDescriptor &deviceDescriptor(size_t index);
DeviceState deviceState(size_t index);
DeviceSnapshot snapshotDevices();
uint32_t takeDeviceChanges(DeviceSnapshot &snapshot);
void turnDeviceOutputsOff();

// 見つからなければ-1を返す。
int deviceIndexOf(const char *id);

// 出力部品をON/OFFする。手動操作もAST実行も必ずここを通す。
// 状態が変わったときだけtrueを返す。
bool setDeviceOutput(size_t index, bool on);

// センサを読み、epsilonを超えて動いた部品に変化の印を付ける。
void pollDeviceSensors();

// 前回の取得以降に変化した部品のビット列を返し、内部の印を落とす。

// 全部品を指すビット列。スナップショットの送信に使う。
uint32_t allDevicesMask();

#endif
