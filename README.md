# ESP32_blockly_editor

## セットアップ
- src/secrets.hを作成し、以下の内容を記述

```h
#pragma once

constexpr char WIFI_SSID[] = "使用するSSID";
constexpr char WIFI_PASSWORD[] = "使用するWifiのパスワード";
```

## テスト

現在の検証結果と実機側の残タスクは[実装基準点の記録](docs/program-execution-checkpoint.md)を参照
実機API・ブラウザ・停止時間・継続運転の結果と計測手順は[実機受け入れ記録](docs/hardware-acceptance.md)を参照

設計判断は[adr/](adr/)に残しています。まずは[adr/0001](adr/0001-device-state-and-control.md)を参照してください。
