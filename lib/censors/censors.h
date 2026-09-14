#ifndef CENSORS_H
#define CENSORS_H

#include <Arduino.h>
#include <VL53L1X.h>
#include <Adafruit_AMG88xx.h>
#include <Wire.h>

int getDistanceData();
float getThermoData();
void initThermo();
void initDistance();
void initCensors();

#endif