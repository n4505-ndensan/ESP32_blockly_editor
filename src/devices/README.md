# 部品ドライバ

部品の一覧は、画面の設定から編集できる部品リスト（`device_settings.h`）で決まる。
1行は`{id, type, label, pins}`で、NVSに保存する（`device_settings_store.cpp`）。
保存が無ければ最初のキット（LED5色・ブザー・温度・距離）を使う。キットの部品も特別扱いしない。

`devices.cpp`は起動時に部品リストを読み、種類ごとの性質（単位・種別・操作・変化の判定幅・読み取り関数）を
足して部品の表を組み立て、`GET /api/devices`で配る。操作UIもBlocklyのツールボックスも、この配信結果から組み立てる。
部品の種類を増やすときは`device_settings.h`の`PartType`と`devices.cpp`の`traitsOf()`に足す。

部品リストの規則（候補ピン、ピンの重複、I2Cの組）は`device_settings.cpp`で検証する。
Arduinoに依存しないので、ホストのUnityテスト（`scripts/test_runtime.py`）でも確かめている。
画面側も`frontend/src/settings/rules.ts`で同じ規則を先に表示する。

出力の変更は必ず`setDeviceOutput()`を通す。手動操作でもAST実行でも同じ経路にしておくことで、
変化の発生元にかかわらず`takeDeviceChanges()`が状態をコピーして取得し、同じ形でクライアントへ届く。

起動時は必ず全出力をOFFにそろえる。
状態の正をESP32に置くため、起点の状態が決まっていないと最初の配信が実機とずれる。
Setup then reports its progress and failures on the kit LEDs and buzzer through `setDeviceOutput()`
([setup status indicator](../../docs/setup-status-indicator.md), ADR 0013).

センサの読み取り本体は`sensors.cpp`に置く。I2Cの初期化と各センサ固有の手順はここに閉じ込め、
`devices.cpp`へは値・取得時刻・有効性を持つ`SensorSample`を返す。表の`read`にそのまま渡せる形にしておくことで、
センサを増やしてもカタログ側の書き方は変わらない。
I2Cは部品リストのSDA・SCLの組ごとに1系統（`Wire`・`Wire1`）を使い、センサは組ごとに別の実体を持つ。
`devices.cpp`は各センサの組の番号を`DeviceDescriptor::bus`に持ち、`read`へ渡す。

設計の理由は[adr/0001](../../adr/0001-device-state-and-control.md)を参照。
部品リストを設定値にした理由は[adr/0009](../../adr/0009-device-list-settings.md)にある。
距離センサを待たずに読む理由は[adr/0002](../../adr/0002-nonblocking-distance-sampling.md)にある。
有効性と配信しきい値の分離は[adr/0007](../../adr/0007-sensor-validity.md)を参照。
