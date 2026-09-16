#include "sensors.h"
#include <Adafruit_AMG88xx.h>
#include <VL53L1X.h>
#include <Wire.h>
#include <limits>

namespace {
VL53L1X distanceSensor;
Adafruit_AMG88xx thermalSensor;
bool distanceInitialized = false, thermalInitialized = false;
SensorSample distanceSample, thermalSample;
}
void initSensors() {
    Wire.begin(); Wire.setClock(400000); Wire.setTimeOut(10);
    distanceSensor.setTimeout(1000);
    distanceInitialized = distanceSensor.init();
    if (distanceInitialized) distanceSensor.startContinuous(100);
    Serial.println(distanceInitialized ? "VL53L1X initialized" : "VL53L1X unavailable");
    thermalInitialized = thermalSensor.begin(0x68);
    Serial.println(thermalInitialized ? "AMG8833 initialized" : "AMG8833 unavailable");
    delay(1000);
}
SensorSample readTemperature() {
    if (!thermalInitialized) return thermalSample;
    // Adafruit's readPixels discards transfer errors. Check every transfer here.
    uint8_t pixels[128];
    for (uint8_t offset = 0; offset < sizeof(pixels); offset += 32) {
        Wire.beginTransmission(0x68); Wire.write(static_cast<uint8_t>(0x80 + offset));
        if (Wire.endTransmission(false) != 0 || Wire.requestFrom(uint8_t(0x68), uint8_t(32)) != 32) {
            while (Wire.available()) Wire.read();
            thermalSample.status = SensorStatus::Unavailable; return thermalSample;
        }
        for (uint8_t i = 0; i < 32; ++i) pixels[offset + i] = Wire.read();
    }
    float highest = -std::numeric_limits<float>::infinity();
    for (uint8_t i = 0; i < 128; i += 2) {
        int16_t raw = (pixels[i] | (pixels[i + 1] << 8)) & 0xfff;
        if (raw & 0x800) raw -= 4096;
        highest = std::max(highest, raw * 0.25f);
    }
    thermalSample = {highest, millis(), SensorStatus::Ok};
    return thermalSample;
}
SensorSample readDistance() {
    if (!distanceInitialized) return distanceSample;
    const bool ready = distanceSensor.dataReady();
    if (distanceSensor.last_status != 0) {
        distanceSample.status = SensorStatus::Unavailable; return distanceSample;
    }
    if (ready) {
        const uint16_t value = distanceSensor.read(false);
        const auto status = distanceSensor.ranging_data.range_status;
        const bool valid = status == VL53L1X::RangeValid || status == VL53L1X::RangeValidMinRangeClipped || status == VL53L1X::RangeValidNoWrapCheckFail;
        if (distanceSensor.last_status == 0 && valid) distanceSample = {static_cast<float>(value), millis(), SensorStatus::Ok};
        else distanceSample.status = SensorStatus::Unavailable;
    }
    distanceSample = freshSample(distanceSample, millis());
    return distanceSample;
}
