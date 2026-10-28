# プログラム実行

`program`がASTの検証と内部表現、`engine`が内部命令列への変換と実行を担う。
どちらも時計・部品を外部から受け取り、ESP32とPCのUnityテストで同じコードを動かす。

`runner`が実機部品・時計・開始停止の要求を接続する。`lifecycle`が開始受付と状態遷移を管理する。
実行はloop()から1回64命令または1msずつ行い、待機中もloop()へ戻る。
開始は全出力OFF、正常終了は保持、停止・エラーは全出力OFF。起動時の部品初期化は呼び直さない。
出力は既存のsetDeviceOutput()を通り、devicesイベントで通知される。

仕様と理由はADR 0005・0006・0007・0011、テストデータは`shared/program-fixtures.json`を参照。

```
pio test -e runtime_test
python scripts/test_runtime.py
```

前者はCOM7のESP32で実行し、テスト用ファームウェアを書き込む。
後者はWindowsのVisual Studio C++ツールと導入済みArduinoJsonを使う。Unity 2.6.1は初回に取得し、.pio内に保存する。
実機テストの後は`pio run -e esp32dev -t upload`で通常のファームウェアへ戻す。
