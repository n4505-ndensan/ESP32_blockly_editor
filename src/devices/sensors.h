#pragma once
#include "sensor_sample.h"
// 部品リストに載っているセンサだけを初期化する。sdaが負ならI2Cを使わない。
void initSensors(int sda, int scl, bool thermal, bool distance);
SensorSample readTemperature();
SensorSample readDistance();
