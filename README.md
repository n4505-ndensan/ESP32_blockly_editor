# ESP32_blockly_editor

## セットアップ (Wifi接続用)
- src/secrets.hを作成し、以下の内容を記述

```
#pragma once

constexpr char WIFI_SSID[] = "使用するSSID";
constexpr char WIFI_PASSWORD[] = "使用するWifiのパスワード";
```