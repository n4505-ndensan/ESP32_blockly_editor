#ifndef DEVICE_API_H
#define DEVICE_API_H

#include <ESPAsyncWebServer.h>

// GET /api/devices と POST /api/devices/command を登録する。
void registerDeviceApi(AsyncWebServer &server);

// 接続直後のクライアントへ全部品のスナップショットを1回だけ送る。
void sendDeviceSnapshot(AsyncEventSourceClient *client);

// 前回の呼び出し以降に変化した部品だけをdevicesイベントで配る。
// 変化が無ければ何も送らない。
void publishDeviceChanges(AsyncEventSource &events);

#endif
