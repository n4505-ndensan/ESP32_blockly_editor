#include "devices.h"

#include <atomic>
#include <math.h>
#include <string.h>

#include <censors.h>

namespace
{
    float readTemperature()
    {
        return getThermoData();
    }

    float readDistance()
    {
        return static_cast<float>(getDistanceData());
    }

    // 部品の一覧。増やすときはこの表に1行足す。
    const DeviceDescriptor kDevices[] = {
        {"led_white", "白色LED", "", "", DeviceKind::Output, DeviceControl::Switch, 18, false, 0.0f, nullptr},
        {"led_red", "赤色LED", "", "", DeviceKind::Output, DeviceControl::Switch, 5, false, 0.0f, nullptr},
        {"led_green", "緑色LED", "", "", DeviceKind::Output, DeviceControl::Switch, 17, false, 0.0f, nullptr},
        {"led_yellow", "黄色LED", "", "", DeviceKind::Output, DeviceControl::Switch, 16, false, 0.0f, nullptr},
        {"led_blue", "青色LED", "", "", DeviceKind::Output, DeviceControl::Switch, 4, false, 0.0f, nullptr},
        {"buzzer", "ブザー", "", "", DeviceKind::Output, DeviceControl::Switch, 23, false, 0.0f, nullptr},
        {"temperature", "温度", "検出範囲の最高温度", "℃", DeviceKind::Sensor, DeviceControl::None, 0, false, 0.05f, readTemperature},
        {"distance", "距離", "対象物までの距離", "mm", DeviceKind::Sensor, DeviceControl::None, 0, false, 1.0f, readDistance},
    };

    constexpr size_t kDeviceCount = sizeof(kDevices) / sizeof(kDevices[0]);

    // 変化の印を1つのuint32_tで持つため、部品数はビット幅までとする。
    static_assert(kDeviceCount <= 32, "部品は32個まで。増やす場合は変化の印の持ち方を変える。");

    DeviceState sStates[kDeviceCount];

    // 出力の変更はHTTPハンドラ(AsyncTCPタスク)から、センサの更新とSSE送信はloop()から入る。
    // 印の読み書きが競合するのでアトミックに扱う。状態の値自体は1語なので取り違えは起きない。
    std::atomic<uint32_t> sChanged{0};

    void writePin(const DeviceDescriptor &device, bool on)
    {
        digitalWrite(device.pin, on != device.activeLow ? HIGH : LOW);
    }
}

void initDevices()
{
    for (size_t i = 0; i < kDeviceCount; i++)
    {
        sStates[i] = DeviceState{false, 0.0f};

        if (kDevices[i].kind != DeviceKind::Output)
            continue;

        pinMode(kDevices[i].pin, OUTPUT);
        writePin(kDevices[i], true);
    }

    // 起動の合図として一度すべて動かし、必ずOFFにそろえてから先へ進む。
    // 状態の正をESP32に置くので、起点の状態が決まっていないと最初の配信が実機とずれる。
    delay(400);

    for (size_t i = 0; i < kDeviceCount; i++)
    {
        if (kDevices[i].kind == DeviceKind::Output)
            writePin(kDevices[i], false);
    }

    initCensors();
    delay(400);
}

size_t deviceCount()
{
    return kDeviceCount;
}

const DeviceDescriptor &deviceDescriptor(size_t index)
{
    return kDevices[index];
}

const DeviceState &deviceState(size_t index)
{
    return sStates[index];
}

int deviceIndexOf(const char *id)
{
    if (id == nullptr)
        return -1;

    for (size_t i = 0; i < kDeviceCount; i++)
    {
        if (strcmp(kDevices[i].id, id) == 0)
            return static_cast<int>(i);
    }

    return -1;
}

bool setDeviceOutput(size_t index, bool on)
{
    if (index >= kDeviceCount || kDevices[index].kind != DeviceKind::Output)
        return false;

    writePin(kDevices[index], on);

    if (sStates[index].on == on)
        return false;

    sStates[index].on = on;
    sChanged.fetch_or(1u << index);
    return true;
}

void pollDeviceSensors()
{
    for (size_t i = 0; i < kDeviceCount; i++)
    {
        if (kDevices[i].kind != DeviceKind::Sensor || kDevices[i].read == nullptr)
            continue;

        const float value = kDevices[i].read();

        // ノイズだけで配信が発生しないよう、部品ごとの幅を超えたときだけ変化とみなす。
        if (fabsf(value - sStates[i].value) < kDevices[i].epsilon)
            continue;

        sStates[i].value = value;
        sChanged.fetch_or(1u << i);
    }
}

uint32_t takeChangedDevices()
{
    return sChanged.exchange(0);
}

uint32_t allDevicesMask()
{
    return kDeviceCount >= 32 ? 0xFFFFFFFFu : ((1u << kDeviceCount) - 1u);
}
