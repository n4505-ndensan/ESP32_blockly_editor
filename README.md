# ESP32_blockly_editor

## フロントエンド開発

SolidJS・TypeScript・Viteの画面を`frontend/`に配置しています。パッケージ管理にはpnpmを使います。
開発時はダミー値、ESP32から配信したときはSSEで温度・距離を表示します。
センサ表示・部品の操作とBlocklyを並べたレイアウトです。Blocklyは現在、編集のみ利用できます。
ビルド成果物は`data/web/`へ出力します。
`pio run -t buildfs`・`-t uploadfs`は前処理として`frontend/`の`pnpm build`を自動実行します。
セットアップとコマンドは[frontend/README.md](frontend/README.md)を参照してください。

## 部品の操作

ブロックを動かす前の動作確認として、LEDとブザーを画面から手でON/OFFできます。
部品の一覧はファームウェアの`src/devices/devices.cpp`が持ち、`GET /api/devices`で配ります。
状態の正はESP32側にあり、画面は`/events`の`devices`イベントで届いた状態だけを表示します。
この経路はAST実行時の状態表示にもそのまま使います。

設計判断は[adr/](adr/)に残しています。まずは[adr/0001](adr/0001-device-state-and-control.md)を参照してください。

## セットアップ (Wifi接続用)
- src/secrets.hを作成し、以下の内容を記述

```h
#pragma once

constexpr char WIFI_SSID[] = "使用するSSID";
constexpr char WIFI_PASSWORD[] = "使用するWifiのパスワード";
```
