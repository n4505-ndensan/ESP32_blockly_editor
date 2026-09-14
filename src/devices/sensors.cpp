#include "sensors.h"

#include <Adafruit_AMG88xx.h>
#include <VL53L1X.h>
#include <Wire.h>

namespace
{
    constexpr uint32_t DISTANCE_INTERVAL_MS = 100;
    constexpr uint32_t DISTANCE_TIMEOUT_MS = 1000;

    VL53L1X sVl53l1x;
    Adafruit_AMG88xx sAmg;
    float sThermoPixels[AMG88xx_PIXEL_ARRAY_SIZE];

    bool sDistanceInitialized = false;
    int sLastDistance = 0;
    uint32_t sLastDistanceAt = 0;

    // 赤外線センサーの初期化
    void initThermo()
    {
        // AMG8833（温度センサー）
        sAmg.begin(0x68); // 成功・失敗にかかわらずTrueを返すライブラリの仕様
        Serial.println("AMG8833初期化");
        delay(1000); // 8833待機
    }

    // 距離センサーの初期化
    void initDistance()
    {
        sDistanceInitialized = false;
        sLastDistance = 0;
        sVl53l1x.setTimeout(DISTANCE_TIMEOUT_MS);
        // LV53L1X（距離センサー）
        if (!sVl53l1x.init())
        {
            Serial.println("VL53L1 初期化失敗");
            return;
        }

        Serial.println("VL53L1 初期化成功");
        sVl53l1x.startContinuous(DISTANCE_INTERVAL_MS);
        sDistanceInitialized = true;
        sLastDistanceAt = millis();
    }
}

void initSensors()
{
    Wire.begin();
    Wire.setClock(400000);
    initDistance();
    initThermo();
}

// 赤外線センサーから検査エリアの最高温度を取得
float readTemperature()
{
    float temp = 0.0f;
    sAmg.readPixels(sThermoPixels);
    for (int i = 0; i < AMG88xx_PIXEL_ARRAY_SIZE; i++)
    {
        if (sThermoPixels[i] > temp)
        {
            temp = sThermoPixels[i];
        }
    }

    return temp;
}

// ToFセンサーから対象物までの距離取得
float readDistance()
{
    if (!sDistanceInitialized)
        return 0.0f;

    // 測定完了を待たず、準備できた値だけを取得する。
    if (sVl53l1x.dataReady() && sVl53l1x.last_status == 0)
    {
        const int distance = sVl53l1x.read(false);
        if (sVl53l1x.last_status == 0)
        {
            sLastDistance = distance;
            sLastDistanceAt = millis();
        }
    }

    // 測定の合間は前回値を維持。1秒更新がなければ従来と同じ0を返す。
    // read(false)はライブラリのタイムアウトを使わないため、経過時間で判定する。
    if (static_cast<uint32_t>(millis() - sLastDistanceAt) >= DISTANCE_TIMEOUT_MS)
        sLastDistance = 0;

    return static_cast<float>(sLastDistance);
}
