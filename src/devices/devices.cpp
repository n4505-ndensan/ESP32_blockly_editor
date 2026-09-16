#include "devices.h"
#include "sensors.h"

#include <math.h>
#include <string.h>

namespace
{
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

    SensorSample sPublished[kDeviceCount];
    portMUX_TYPE sMutex = portMUX_INITIALIZER_UNLOCKED;
    uint32_t sChanged = 0, sRevision = 0;

    void writePin(const DeviceDescriptor &device, bool on)
    {
        digitalWrite(device.pin, on != device.activeLow ? HIGH : LOW);
    }
}

void initDevices()
{
    for (size_t i = 0; i < kDeviceCount; i++)
    {
        sStates[i] = DeviceState{};

        if (kDevices[i].kind != DeviceKind::Output)
            continue;

        pinMode(kDevices[i].pin, OUTPUT);
        setDeviceOutput(i, true);
    }

    // 起動の合図として一度すべて動かし、必ずOFFにそろえてから先へ進む。
    // 状態の正をESP32に置くので、起点の状態が決まっていないと最初の配信が実機とずれる。
    delay(400);

    turnDeviceOutputsOff();

    initSensors();
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

DeviceState deviceState(size_t index)
{
    portENTER_CRITICAL(&sMutex);
    DeviceState state = sStates[index];
    portEXIT_CRITICAL(&sMutex);
    state.sample = freshSample(state.sample, millis());
    return state;
}

DeviceSnapshot snapshotDevices() {
    DeviceSnapshot snapshot{};
    portENTER_CRITICAL(&sMutex);
    memcpy(snapshot.states, sStates, sizeof(sStates)); snapshot.revision = sRevision;
    portEXIT_CRITICAL(&sMutex);
    return snapshot;
}

void turnDeviceOutputsOff() {
    for (size_t i = 0; i < kDeviceCount; ++i) if (kDevices[i].kind == DeviceKind::Output) setDeviceOutput(i, false);
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

    portENTER_CRITICAL(&sMutex);
    writePin(kDevices[index], on);
    const bool changed = sStates[index].on != on;
    sStates[index].on = on;
    if (changed) { sChanged |= 1u << index; ++sRevision; }
    portEXIT_CRITICAL(&sMutex);
    return changed;
}

void pollDeviceSensors()
{
    for (size_t i = 0; i < kDeviceCount; i++)
    {
        if (kDevices[i].kind != DeviceKind::Sensor || kDevices[i].read == nullptr)
            continue;

        const SensorSample sample = freshSample(kDevices[i].read(), millis());
        portENTER_CRITICAL(&sMutex);
        if (sensorChanged(sPublished[i], sample, kDevices[i].epsilon)) sChanged |= 1u << i;
        // The runtime always sees the latest sample, even below the SSE epsilon.
        sStates[i].sample = sample; ++sRevision;
        portEXIT_CRITICAL(&sMutex);
    }
}

uint32_t takeDeviceChanges(DeviceSnapshot &snapshot)
{
    portENTER_CRITICAL(&sMutex);
    const uint32_t changed = sChanged; sChanged = 0;
    memcpy(snapshot.states, sStates, sizeof(sStates)); snapshot.revision = sRevision;
    for (size_t i = 0; i < kDeviceCount; ++i) if (changed & (1u << i)) sPublished[i] = sStates[i].sample;
    portEXIT_CRITICAL(&sMutex);
    return changed;
}

uint32_t allDevicesMask()
{
    return kDeviceCount >= 32 ? 0xFFFFFFFFu : ((1u << kDeviceCount) - 1u);
}
