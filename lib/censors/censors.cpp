
#include "censors.h"

VL53L1X vl53l1x;
Adafruit_AMG88xx amg;
float AMG8833_pixels[AMG88xx_PIXEL_ARRAY_SIZE];

// ToFセンサーから対象物までの距離取得
int getDistanceData()
{
    // ToFセンサーから距離取得
    int sid4 = vl53l1x.readRangeSingleMillimeters();
    if (vl53l1x.timeoutOccurred())
        sid4 = 0;

    return sid4;
}

// 赤外線センサーから検査エリアの最高温度を取得
float getThermoData()
{
    float temp = 0.0;
    // 赤外線センサーから温度を取得
    amg.readPixels(AMG8833_pixels);
    for (int i = 0; i < AMG88xx_PIXEL_ARRAY_SIZE; i++)
    {
        if (AMG8833_pixels[i] > temp)
        {
            temp = AMG8833_pixels[i];
        }
    }

    return temp;
}

// 赤外線センサーの初期化
void initThermo()
{
    // AMG8833（温度センサー）
    amg.begin(0x68); // 成功・失敗にかかわらずTrueを返すライブラリの仕様
    Serial.println("AMG8833初期化");
    delay(1000); // 8833待機
}

// 距離センサーの初期化
void initDistance()
{
    vl53l1x.setTimeout(1000);
    // LV53L1X（距離センサー）
    if (!vl53l1x.init())
    {
        Serial.println("VL53L1 初期化失敗");
    }
    else
    {
        Serial.println("VL53L1 初期化成功");
    }
    vl53l1x.readRangeSingleMillimeters(10);
}

void initCensors()
{
    Wire.begin();
    Wire.setClock(400000);
    initDistance();
    initThermo();
}
