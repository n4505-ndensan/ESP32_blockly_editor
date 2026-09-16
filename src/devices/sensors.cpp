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
    VL53L1X distanceSensor;
    Adafruit_AMG88xx thermalSensor;
    bool distanceInitialized = false, thermalInitialized = false;
    SensorSample distanceSample, thermalSample;
#ifdef SENSOR_DIAGNOSTICS
    SensorDiagnosticHistory distanceHistory;
    int distanceCause = 6;
    // 0=ok, 1=init, 2=dataReady write failure, 3=read's final write failure,
    // 4=range quality failure, 5=stale, 6=awaiting first sample.
    // last_status cannot prove all I2C reads succeeded.
    void logDistance(int cause, bool attempted, bool success, bool ready, int readyI2c, int readI2c, int rangeStatus)
    {
        const uint32_t now = millis();
        if (attempted)
            distanceHistory.record(success, success ? distanceSample.updatedAt : now);
        distanceCause = cause;
        const uint16_t key = cause == 4 ? uint16_t(16 + static_cast<int>(distanceSensor.ranging_data.range_status)) : uint16_t(cause);
        if (!distanceHistory.shouldLog(key, now))
            return;
        static const char *names[] = {"ok", "not_initialized", "data_ready_i2c", "read_final_i2c", "range_status", "stale", "no_sample"};
        JsonDocument doc;
        doc["ts"] = now;
        doc["sensor"] = "distance";
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
#endif
}
void initSensors()
{
    Wire.begin();
    Wire.setClock(400000);
    Wire.setTimeOut(10);
    distanceSensor.setTimeout(1000);
    distanceInitialized = distanceSensor.init();
    if (distanceInitialized)
        distanceSensor.startContinuous(100);
    Serial.println(distanceInitialized ? "VL53L1X initialized" : "VL53L1X unavailable");
    thermalInitialized = thermalSensor.begin(0x68);
    Serial.println(thermalInitialized ? "AMG8833 initialized" : "AMG8833 unavailable");
#ifdef SENSOR_DIAGNOSTICS
    JsonDocument doc;
    doc["sensor"] = "distance";
    doc["initialized"] = distanceInitialized;
    doc["mode"] = distanceSensor.getDistanceMode() == VL53L1X::Long ? "long" : distanceSensor.getDistanceMode() == VL53L1X::Short ? "short"
                                                                                                                                  : "other";
    if (distanceInitialized)
        doc["budgetUs"] = distanceSensor.getMeasurementTimingBudget();
    doc["periodMs"] = 100;
    doc["wireClockHz"] = 400000;
    doc["wireTimeoutMs"] = 10;
    doc["libraryWaitTimeoutMs"] = distanceSensor.getTimeout();
    Serial.print("SENSOR_CONFIG ");
    serializeJson(doc, Serial);
    Serial.println();
#endif
    delay(1000);
}
SensorSample readTemperature()
{
    if (!thermalInitialized)
        return thermalSample;
    // Adafruit's readPixels discards transfer errors. Check every transfer here.
    uint8_t pixels[128];
    for (uint8_t offset = 0; offset < sizeof(pixels); offset += 32)
    {
        Wire.beginTransmission(0x68);
        Wire.write(static_cast<uint8_t>(0x80 + offset));
        if (Wire.endTransmission(false) != 0 || Wire.requestFrom(uint8_t(0x68), uint8_t(32)) != 32)
        {
            while (Wire.available())
                Wire.read();
            thermalSample.status = SensorStatus::Unavailable;
            return thermalSample;
        }
        for (uint8_t i = 0; i < 32; ++i)
            pixels[offset + i] = Wire.read();
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
    return thermalSample;
}
SensorSample readDistance()
{
    if (!distanceInitialized)
    {
#ifdef SENSOR_DIAGNOSTICS
        logDistance(1, false, false, false, -1, -1, -1);
#endif
        return distanceSample;
    }
    const bool ready = distanceSensor.dataReady();
#ifdef SENSOR_DIAGNOSTICS
    const int readyI2c = distanceSensor.last_status;
    int readI2c = -1, rangeStatus = -1;
    bool success = false;
    int cause = distanceCause;
#endif
    if (distanceSensor.last_status != 0)
    {
        distanceSample = updateDistanceSample(distanceSample, DistanceReadResult::FatalFailure, 0, millis());
#ifdef SENSOR_DIAGNOSTICS
        logDistance(2, true, false, ready, readyI2c, -1, -1);
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
    logDistance(cause, ready, success, ready, readyI2c, readI2c, rangeStatus);
#endif
    return distanceSample;
}
