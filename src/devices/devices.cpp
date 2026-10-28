#include "devices.h"
#include "device_settings_store.h"
#include "sensors.h"

#include <math.h>
#include <string.h>

namespace
{
    // 部品の種類ごとの性質。ID・表示名・ピンは部品リストから、それ以外はここから決める。
    struct TypeTraits
    {
        DeviceKind kind;
        DeviceControl control;
        const char *unit;
        float epsilon;
        SensorSample (*read)(uint8_t bus);
    };

    TypeTraits traitsOf(PartType type)
    {
        switch (type)
        {
        case PartType::Thermo:
            return {DeviceKind::Sensor, DeviceControl::None, "℃", 0.05f, readTemperature};
        case PartType::Tof:
            return {DeviceKind::Sensor, DeviceControl::None, "mm", 1.0f, readDistance};
        default:
            return {DeviceKind::Output, DeviceControl::Switch, "", 0.0f, nullptr};
        }
    }

    // 変化の印を1つのuint32_tで持つため、部品数はビット幅までとする。
    static_assert(MAX_PARTS <= 32, "部品は32個まで。増やす場合は変化の印の持ち方を変える。");

    // sDevicesのid・labelはsPartsの文字列を指す。どちらも起動後は変えない。
    PartList sParts;
    DeviceDescriptor sDevices[MAX_PARTS];
    size_t sDeviceCount = 0;

    DeviceState sStates[MAX_PARTS];

    SensorSample sPublished[MAX_PARTS];
    portMUX_TYPE sMutex = portMUX_INITIALIZER_UNLOCKED;
    uint32_t sChanged = 0, sRevision = 0;

    void writePin(const DeviceDescriptor &device, bool on)
    {
        digitalWrite(device.pin, on != device.activeLow ? HIGH : LOW);
    }
}

bool initDevices()
{
    loadPartList(sParts);
    sDeviceCount = sParts.count;

    // SDA・SCLの組が同じセンサは同じI2Cにつなぐ。組の番号は部品リストに初めて出てきた順に振る。
    // 部品リストは検証済みなので、組はMAX_I2C_BUSESまでで、各組に同じ種類のセンサは1個まで。
    SensorBus buses[MAX_I2C_BUSES] = {};
    size_t busCount = 0;
    for (size_t i = 0; i < sDeviceCount; i++)
    {
        const PartConfig &part = sParts.parts[i];
        const TypeTraits traits = traitsOf(part.type);
        uint8_t bus = 0;
        if (isI2cPart(part.type))
        {
            while (bus < busCount && !(buses[bus].sda == part.pins[0] && buses[bus].scl == part.pins[1]))
                ++bus;
            if (bus == busCount)
                buses[busCount++] = SensorBus{part.pins[0], part.pins[1], false, false};
            buses[bus].thermal |= part.type == PartType::Thermo;
            buses[bus].distance |= part.type == PartType::Tof;
        }
        sDevices[i] = DeviceDescriptor{part.id, part.label, part.type, traits.unit, traits.kind, traits.control,
                                       traits.kind == DeviceKind::Output ? part.pins[0] : uint8_t(0), false, traits.epsilon, bus, traits.read};
    }

    for (size_t i = 0; i < sDeviceCount; i++)
    {
        sStates[i] = DeviceState{};

        if (sDevices[i].kind != DeviceKind::Output)
            continue;

        pinMode(sDevices[i].pin, OUTPUT);
    }

    // 必ずOFFにそろえてから先へ進む。
    // 状態の正をESP32に置くので、起点の状態が決まっていないと最初の配信が実機とずれる。
    turnDeviceOutputsOff();

    const bool sensorsInitialized = initSensors(buses, busCount);
    delay(400);
    return sensorsInitialized;
}

const PartList &activePartList()
{
    return sParts;
}

size_t deviceCount()
{
    return sDeviceCount;
}

const DeviceDescriptor &deviceDescriptor(size_t index)
{
    return sDevices[index];
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
    for (size_t i = 0; i < sDeviceCount; ++i) if (sDevices[i].kind == DeviceKind::Output) setDeviceOutput(i, false);
}

int deviceIndexOf(const char *id)
{
    if (id == nullptr)
        return -1;

    for (size_t i = 0; i < sDeviceCount; i++)
    {
        if (strcmp(sDevices[i].id, id) == 0)
            return static_cast<int>(i);
    }

    return -1;
}

bool setDeviceOutput(size_t index, bool on)
{
    if (index >= sDeviceCount || sDevices[index].kind != DeviceKind::Output)
        return false;

    portENTER_CRITICAL(&sMutex);
    writePin(sDevices[index], on);
    const bool changed = sStates[index].on != on;
    sStates[index].on = on;
    if (changed) { sChanged |= 1u << index; ++sRevision; }
    portEXIT_CRITICAL(&sMutex);
    return changed;
}

void pollDeviceSensors()
{
    for (size_t i = 0; i < sDeviceCount; i++)
    {
        if (sDevices[i].kind != DeviceKind::Sensor || sDevices[i].read == nullptr)
            continue;

        const SensorSample sample = freshSample(sDevices[i].read(sDevices[i].bus), millis());
        portENTER_CRITICAL(&sMutex);
        if (sensorChanged(sPublished[i], sample, sDevices[i].epsilon)) sChanged |= 1u << i;
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
    for (size_t i = 0; i < sDeviceCount; ++i) if (changed & (1u << i)) sPublished[i] = sStates[i].sample;
    portEXIT_CRITICAL(&sMutex);
    return changed;
}

uint32_t allDevicesMask()
{
    return sDeviceCount >= 32 ? 0xFFFFFFFFu : ((1u << sDeviceCount) - 1u);
}
