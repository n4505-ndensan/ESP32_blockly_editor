#ifndef SENSORS_H
#define SENSORS_H

#include <Arduino.h>

// センサの読み取り本体。devices.cppの部品カタログから読み取り関数として参照する。
// 値はカタログの`read`に合わせてfloatで返し、読めないときは0を返す。

// I2Cと各センサを初期化する。initDevices()から1度だけ呼ぶ。
void initSensors();

// 検出範囲の最高温度[℃]。
float readTemperature();

// 対象物までの距離[mm]。測定完了を待たず最新値を返す。
// 初期化に失敗している、または1秒間更新がない場合は0。
float readDistance();

#endif
