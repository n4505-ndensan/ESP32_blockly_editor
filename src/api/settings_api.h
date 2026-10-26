#pragma once
#include <ESPAsyncWebServer.h>

// GET/POST /api/settings/devices を登録する。
void registerSettingsApi(AsyncWebServer &server);

// loop()から呼ぶ。部品リストを保存した後の再起動予約を処理する。
// 非同期ハンドラの中では再起動せず、応答を送り切る猶予を置いてからここで行う。
void serviceSettingsRestart();

// 部品リストを保存し、再起動を待っている間はtrue。プログラムの開始もこの間は受け付けない。
bool settingsRestartPending();
