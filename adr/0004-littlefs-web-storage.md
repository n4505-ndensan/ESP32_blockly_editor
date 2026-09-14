# ADR 0004: Web素材の保存先をLittleFSに移行する

- ステータス: 採用
- 日付: 2026-09-14

## 背景

SPIFFSのパス全体の名前長制限を避け、今後のプログラム保存でもディレクトリを扱えるようにする。
現在のArduino-ESP32にはLittleFSが含まれており、既存のWeb配信APIで利用できる。

## 決定

- `board_build.filesystem = littlefs`を指定し、マウントと`serveStatic()`に`LittleFS`を使う。
- 現在の既定パーティション配置を維持する。Arduino-ESP32 2.xのLittleFSの既定ラベルは
  `spiffs`なので、パーティションの名前・サブタイプはそのまま、内容だけLittleFS形式にする。
  ファームウェア領域やFS領域の位置・容量は変更しない。
- ビルド済みイメージを配る用途なので、`LittleFS.begin(false)`でマウントする。
  失敗時に空のFSへフォーマットせず、`uploadfs`を実行する案内をシリアルに出す。
- ADR 0003のgzip方式・短いハッシュ付き出力名・プレビュー用と実機用の成果物の分離は継続する。
  SPIFFS固有のパス全体31バイト制限だけをビルドスクリプトから取り除く。

## 影響

初回移行時はファームウェアとLittleFSイメージの両方を書き込む。
旧SPIFFSの内容は自動変換せず、`data/`から生成したイメージで置き換える。
FSイメージの名前は`littlefs.bin`になり、既存のビルド前処理はFS名を変数で参照しているため流用できる。
画面のURL、gzip配信、API、SSEは従来どおり。

## 参考

- [PlatformIOのFS選択](https://docs.platformio.org/en/latest/platforms/espressif32.html#uploading-files-to-file-system)
- [Arduino-ESP32 2.0.17のLittleFS API](https://github.com/espressif/arduino-esp32/blob/2.0.17/libraries/LittleFS/src/LittleFS.h)
