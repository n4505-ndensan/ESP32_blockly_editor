#pragma once
#include "device_settings.h"
#include "sensor_sample.h"

// I2Cの1組（SDA・SCL）と、そこにつながっているセンサ。組ごとに別のI2C（Wire・Wire1）を使う。
struct SensorBus
{
    uint8_t sda, scl;
    bool thermal, distance;
};

// 部品リストに載っているセンサだけを初期化する。組が無ければI2Cを使わない。
void initSensors(const SensorBus *buses, size_t count);
// busはinitSensorsに渡した組の番号。
SensorSample readTemperature(uint8_t bus);
SensorSample readDistance(uint8_t bus);
