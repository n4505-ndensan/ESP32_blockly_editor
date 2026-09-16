# ESP32_blockly_editor

## フロントエンド開発

SolidJS・TypeScript・Viteの画面を`frontend/`に配置しています。パッケージ管理にはpnpmを使います。
開発時はダミー値、実機接続時はSSEで温度・距離と実行状態を表示します。
Blocklyの開始ブロックにつながる処理をRUNでESP32へ送り、実行・停止できます。
ビルド成果物は`frontend/dist/`へ出力し、HTML・JS・CSSをgzip圧縮して実機用の`data/web/`へ配置します。
`pio run -t buildfs`・`-t uploadfs`は前処理として`frontend/`の`pnpm build`を自動実行します。
実機のWeb素材はLittleFSに保存します。SPIFFSからの移行時は`upload`と`uploadfs`の両方が必要です。
セットアップとコマンドは[frontend/README.md](frontend/README.md)を参照してください。

## 部品の操作

ブロックを動かす前の動作確認として、LEDとブザーを画面から手でON/OFFできます。
部品の一覧はファームウェアの`src/devices/devices.cpp`が持ち、`GET /api/devices`で配ります。
状態の正はESP32側にあり、画面は`/events`の`devices`イベントで届いた状態だけを表示します。
この経路はAST実行時の状態表示にもそのまま使います。
実行中は個別操作を禁止し、「すべて消す」で実行停止と全出力OFFを行います。
正常終了時は出力を保持し、停止・エラー時にはOFFにします。ブラウザを閉じても実行は続きます。
ブロックの保存・復元は未実装です。

## テスト

現在の検証結果と実機側の残タスクは[実装基準点の記録](docs/program-execution-checkpoint.md)を参照してください。
実機API・ブラウザ・停止時間・継続運転の結果と計測手順は[実機受け入れ記録](docs/hardware-acceptance.md)にまとめています。

フロントエンドは`frontend/`で`pnpm test`（Vitest）、`pnpm test:watch`で監視します。
実行器は`pio test -e runtime_test`（ESP32上のUnity）、またはWindowsで`python scripts/test_runtime.py`。
実機APIは`python scripts/test_program_api.py http://<ESP32のIP>`で確認できます。
実機テストは出力を操作し、終了時に全出力をOFFにします。Unity実機テスト後は通常のファームウェアを再書き込みしてください。

設計判断は[adr/](adr/)に残しています。まずは[adr/0001](adr/0001-device-state-and-control.md)を参照してください。

## セットアップ (Wifi接続用)
- src/secrets.hを作成し、以下の内容を記述

```h
#pragma once

constexpr char WIFI_SSID[] = "使用するSSID";
constexpr char WIFI_PASSWORD[] = "使用するWifiのパスワード";
```
