#include "sensors.h"
#include "distance_sample.h"
#include <Adafruit_AMG88xx.h>
#include <VL53L1X.h>
#include <Wire.h>
#include <limits>
#ifdef SENSOR_DIAGNOSTICS
#include "sensor_diagnostics.h"
#include <ArduinoJson.h>
#endif

namespace
{
    // A sensor that has not answered for this long is initialized again, at most once per interval (ADR 0011).
    constexpr uint32_t RECONNECT_INTERVAL_MS = 1000;
    // VL53L1X boot wait during a reconnect. Short enough that loop() keeps serving STOP and SSE.
    constexpr uint16_t RECONNECT_BOOT_TIMEOUT_MS = 20;
    // Adafruit's AMG8833 begin() waits this long after its reset; a reconnect skips reads instead.
    constexpr uint32_t THERMAL_SETTLE_MS = 100;
    constexpr uint8_t AMG8833_ADDRESS = 0x68;

    // I2Cの1組につき、各種類のセンサは1個まで（アドレスが固定のため）。
    struct BusSensors
    {
        TwoWire *wire = nullptr;
        VL53L1X distanceSensor;
        Adafruit_AMG88xx thermalSensor;
        bool distanceInitialized = false, thermalInitialized = false;
        SensorSample distanceSample, thermalSample;
        // Last measurement read over I2C regardless of its quality, or last reconnect attempt.
        uint32_t distanceAliveAt = 0, thermalAliveAt = 0;
        bool thermalSettling = false;
#ifdef SENSOR_DIAGNOSTICS
        SensorDiagnosticHistory distanceHistory;
        int distanceCause = 6;
#endif
    };

    TwoWire *const kWires[] = {&Wire, &Wire1};
    static_assert(MAX_I2C_BUSES <= sizeof(kWires) / sizeof(kWires[0]), "I2Cの組の数がESP32のI2Cの数を超えている。");
    BusSensors sBuses[MAX_I2C_BUSES];

#ifdef SENSOR_DIAGNOSTICS
    // 0=ok, 1=init, 2=dataReady write failure, 3=read's final write failure,
    // 4=range quality failure, 5=stale, 6=awaiting first sample.
    // last_status cannot prove all I2C reads succeeded.
    void logDistance(uint8_t index, int cause, bool attempted, bool success, bool ready, int readyI2c, int readI2c, int rangeStatus)
    {
        BusSensors &bus = sBuses[index];
        VL53L1X &distanceSensor = bus.distanceSensor;
        const SensorSample &distanceSample = bus.distanceSample;
        SensorDiagnosticHistory &distanceHistory = bus.distanceHistory;
        const uint32_t now = millis();
        if (attempted)
            distanceHistory.record(success, success ? distanceSample.updatedAt : now);
        bus.distanceCause = cause;
        const uint16_t key = cause == 4 ? uint16_t(16 + static_cast<int>(distanceSensor.ranging_data.range_status)) : uint16_t(cause);
        if (!distanceHistory.shouldLog(key, now))
            return;
        static const char *names[] = {"ok", "not_initialized", "data_ready_i2c", "read_final_i2c", "range_status", "stale", "no_sample"};
        JsonDocument doc;
        doc["ts"] = now;
        doc["sensor"] = "distance";
        doc["bus"] = index;
        doc["reason"] = names[cause];
        doc["status"] = sensorStatusName(distanceSample.status);
        doc["ready"] = ready;
        doc["readAttempted"] = readI2c >= 0;
        if (readyI2c >= 0)
            doc["readyI2c"] = readyI2c;
        else
            doc["readyI2c"] = nullptr;
        if (readI2c >= 0)
            doc["readFinalI2c"] = readI2c;
        else
            doc["readFinalI2c"] = nullptr;
        if (rangeStatus >= 0)
        {
            doc["rangeStatus"] = rangeStatus;
            doc["rangeStatusName"] = VL53L1X::rangeStatusToString(static_cast<VL53L1X::RangeStatus>(rangeStatus));
            doc["reportedMm"] = distanceSensor.ranging_data.range_mm;
            doc["signalMCPS"] = distanceSensor.ranging_data.peak_signal_count_rate_MCPS;
            doc["ambientMCPS"] = distanceSensor.ranging_data.ambient_count_rate_MCPS;
        }
        else
            doc["rangeStatus"] = nullptr;
        if (distanceHistory.hasGood)
        {
            doc["lastGoodAgeMs"] = uint32_t(now - distanceHistory.lastGoodAt);
            doc["lastGoodMm"] = distanceSample.value;
        }
        else
        {
            doc["lastGoodAgeMs"] = nullptr;
            doc["lastGoodMm"] = nullptr;
        }
        doc["consecutiveFailures"] = distanceHistory.consecutiveFailures;
        doc["totalFailures"] = distanceHistory.totalFailures;
        Serial.print("SENSOR ");
        serializeJson(doc, Serial);
        Serial.println();
    }
    void logReconnect(uint8_t index, const char *sensor, bool initialized)
    {
        JsonDocument doc;
        doc["ts"] = millis();
        doc["sensor"] = sensor;
        doc["bus"] = index;
        doc["initialized"] = initialized;
        Serial.print("SENSOR_RECONNECT ");
        serializeJson(doc, Serial);
        Serial.println();
    }
#endif

    void reconnectDistance(uint8_t index, uint32_t now)
    {
        BusSensors &bus = sBuses[index];
        bus.distanceAliveAt = now;
        // stopContinuous() also clears the library's calibration flag, which init() keeps.
        bus.distanceSensor.stopContinuous();
        bus.distanceSensor.setTimeout(RECONNECT_BOOT_TIMEOUT_MS);
        bus.distanceInitialized = bus.distanceSensor.init();
        if (bus.distanceInitialized)
            bus.distanceSensor.startContinuous(100);
        else
            bus.distanceSample = updateDistanceSample(bus.distanceSample, DistanceReadResult::FatalFailure, 0, now);
#ifdef SENSOR_DIAGNOSTICS
        logReconnect(index, "distance", bus.distanceInitialized);
#endif
    }

    bool writeThermal(TwoWire &wire, uint8_t reg, uint8_t value)
    {
        wire.beginTransmission(AMG8833_ADDRESS);
        wire.write(reg);
        wire.write(value);
        return wire.endTransmission() == 0;
    }
    // Same register writes as Adafruit's begin(): normal mode, initial reset, interrupts off, 10 FPS.
    void reconnectThermal(uint8_t index, uint32_t now)
    {
        BusSensors &bus = sBuses[index];
        TwoWire &wire = *bus.wire;
        bus.thermalAliveAt = now;
        bus.thermalInitialized = writeThermal(wire, 0x00, 0x00) && writeThermal(wire, 0x01, 0x3f) &&
                                 writeThermal(wire, 0x03, 0x00) && writeThermal(wire, 0x02, 0x00);
        bus.thermalSettling = bus.thermalInitialized;
        if (!bus.thermalInitialized)
            bus.thermalSample.status = SensorStatus::Unavailable;
#ifdef SENSOR_DIAGNOSTICS
        logReconnect(index, "thermal", bus.thermalInitialized);
#endif
    }
}
void initSensors(const SensorBus *buses, size_t count)
{
    // センサが無いときはI2Cを開かない。SDA・SCLだったピンをLEDなどに使っていてもぶつからない。
    if (count == 0)
    {
        Serial.println("No I2C sensors in the part list");
        return;
    }
    for (size_t index = 0; index < count && index < MAX_I2C_BUSES; ++index)
    {
        const SensorBus &config = buses[index];
        BusSensors &bus = sBuses[index];
        bus.wire = kWires[index];
        bus.wire->begin(config.sda, config.scl);
        bus.wire->setClock(400000);
        bus.wire->setTimeOut(10);
        Serial.printf("I2C bus %u: SDA GPIO%u / SCL GPIO%u\n", static_cast<unsigned>(index), config.sda, config.scl);
        if (config.distance)
        {
            bus.distanceSensor.setBus(bus.wire);
            bus.distanceSensor.setTimeout(1000);
            bus.distanceInitialized = bus.distanceSensor.init();
            if (bus.distanceInitialized)
                bus.distanceSensor.startContinuous(100);
            Serial.println(bus.distanceInitialized ? "VL53L1X initialized" : "VL53L1X unavailable");
        }
        if (config.thermal)
        {
            bus.thermalInitialized = bus.thermalSensor.begin(AMG8833_ADDRESS, bus.wire);
            Serial.println(bus.thermalInitialized ? "AMG8833 initialized" : "AMG8833 unavailable");
        }
#ifdef SENSOR_DIAGNOSTICS
        if (!config.distance)
            continue;
        VL53L1X &distanceSensor = bus.distanceSensor;
        JsonDocument doc;
        doc["sensor"] = "distance";
        doc["bus"] = index;
        doc["initialized"] = bus.distanceInitialized;
        doc["mode"] = distanceSensor.getDistanceMode() == VL53L1X::Long ? "long" : distanceSensor.getDistanceMode() == VL53L1X::Short ? "short"
                                                                                                                                      : "other";
        if (bus.distanceInitialized)
            doc["budgetUs"] = distanceSensor.getMeasurementTimingBudget();
        doc["periodMs"] = 100;
        doc["wireClockHz"] = 400000;
        doc["wireTimeoutMs"] = 10;
        doc["libraryWaitTimeoutMs"] = distanceSensor.getTimeout();
        Serial.print("SENSOR_CONFIG ");
        serializeJson(doc, Serial);
        Serial.println();
#endif
    }
    delay(1000);
}
static SensorSample sampleTemperature(uint8_t index)
{
    BusSensors &bus = sBuses[index];
    SensorSample &thermalSample = bus.thermalSample;
    if (!bus.thermalInitialized)
        return thermalSample;
    if (bus.thermalSettling)
    {
        if (millis() - bus.thermalAliveAt < THERMAL_SETTLE_MS)
            return thermalSample;
        bus.thermalSettling = false;
    }
    TwoWire &wire = *bus.wire;
    // Adafruit's readPixels discards transfer errors. Check every transfer here.
    uint8_t pixels[128];
    for (uint8_t offset = 0; offset < sizeof(pixels); offset += 32)
    {
        wire.beginTransmission(AMG8833_ADDRESS);
        wire.write(static_cast<uint8_t>(0x80 + offset));
        if (wire.endTransmission(false) != 0 || wire.requestFrom(AMG8833_ADDRESS, uint8_t(32)) != 32)
        {
            while (wire.available())
                wire.read();
            thermalSample.status = SensorStatus::Unavailable;
            return thermalSample;
        }
        for (uint8_t i = 0; i < 32; ++i)
            pixels[offset + i] = wire.read();
    }
    float highest = -std::numeric_limits<float>::infinity();
    for (uint8_t i = 0; i < 128; i += 2)
    {
        int16_t raw = (pixels[i] | (pixels[i + 1] << 8)) & 0xfff;
        if (raw & 0x800)
            raw -= 4096;
        highest = std::max(highest, raw * 0.25f);
    }
    thermalSample = {highest, millis(), SensorStatus::Ok};
    bus.thermalAliveAt = thermalSample.updatedAt;
    return thermalSample;
}
SensorSample readTemperature(uint8_t index)
{
    const SensorSample sample = sampleTemperature(index);
    const uint32_t now = millis();
    if (now - sBuses[index].thermalAliveAt < RECONNECT_INTERVAL_MS)
        return sample;
    reconnectThermal(index, now);
    return sBuses[index].thermalSample;
}
static SensorSample sampleDistance(uint8_t index)
{
    BusSensors &bus = sBuses[index];
    VL53L1X &distanceSensor = bus.distanceSensor;
    SensorSample &distanceSample = bus.distanceSample;
    if (!bus.distanceInitialized)
    {
#ifdef SENSOR_DIAGNOSTICS
        logDistance(index, 1, false, false, false, -1, -1, -1);
#endif
        return distanceSample;
    }
    const bool ready = distanceSensor.dataReady();
#ifdef SENSOR_DIAGNOSTICS
    const int readyI2c = distanceSensor.last_status;
    int readI2c = -1, rangeStatus = -1;
    bool success = false;
    int cause = bus.distanceCause;
#endif
    if (distanceSensor.last_status != 0)
    {
        distanceSample = updateDistanceSample(distanceSample, DistanceReadResult::FatalFailure, 0, millis());
#ifdef SENSOR_DIAGNOSTICS
        logDistance(index, 2, true, false, ready, readyI2c, -1, -1);
#endif
        return distanceSample;
    }
    if (ready)
    {
        const uint16_t value = distanceSensor.read(false);
        const auto status = distanceSensor.ranging_data.range_status;
        const bool valid = status == VL53L1X::RangeValid || status == VL53L1X::RangeValidMinRangeClipped || status == VL53L1X::RangeValidNoWrapCheckFail;
        const bool transient = status == VL53L1X::WrapTargetFail || status == VL53L1X::SignalFail;
        const auto result = distanceSensor.last_status != 0 ? DistanceReadResult::FatalFailure
                            : valid                         ? DistanceReadResult::Valid
                            : transient                     ? DistanceReadResult::TransientFailure
                                                            : DistanceReadResult::FatalFailure;
        // A result read over I2C is a measurement whatever its quality, so it postpones a reconnect.
        if (distanceSensor.last_status == 0)
            bus.distanceAliveAt = millis();
        distanceSample = updateDistanceSample(distanceSample, result, static_cast<float>(value), millis());
#ifdef SENSOR_DIAGNOSTICS
        readI2c = distanceSensor.last_status;
        rangeStatus = static_cast<int>(status);
        success = readI2c == 0 && valid;
        cause = readI2c != 0 ? 3 : valid ? 0
                                         : 4;
#endif
    }
    distanceSample = freshSample(distanceSample, millis());
#ifdef SENSOR_DIAGNOSTICS
    if (distanceSample.status == SensorStatus::Stale)
        cause = 5;
    logDistance(index, cause, ready, success, ready, readyI2c, readI2c, rangeStatus);
#endif
    return distanceSample;
}
// Reconnects when no measurement has been read for an interval: init failed, the bus fails,
// or the sensor stopped ranging after a reset. Optical failures still count as measurements.
SensorSample readDistance(uint8_t index)
{
    const SensorSample sample = sampleDistance(index);
    const uint32_t now = millis();
    if (now - sBuses[index].distanceAliveAt < RECONNECT_INTERVAL_MS)
        return sample;
    reconnectDistance(index, now);
    return sBuses[index].distanceSample;
}
