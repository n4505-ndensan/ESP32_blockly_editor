# ADR 0003: Web素材をビルド時にgzip圧縮する

- ステータス: 採用
- 日付: 2026-09-14

## 背景

Web素材の大部分はBlocklyを含むJavaScriptで、未圧縮では約818KBある。
gzipで容量と初回アクセス時の転送量を減らせる。

## 決定

- PCでのビルド時にNode.js標準機能でHTML・JS・CSSをgzip圧縮する。
- Viteの未圧縮成果物は`frontend/dist/`に残して`pnpm preview`で使う。
- `data/web/`には実機用のファイルだけを置き、圧縮で小さくなるものは`.gz`のみ配置する。
- ESPAsyncWebServerの既存のgzip配信を使用する。ブラウザが展開するため、ESP32で圧縮・展開しない。
- 出力名にはハッシュを残しつつ短縮し、SPIFFSのパス長上限31バイトをビルド時に検査する。

## 影響

既存の`pnpm build`・`buildfs`・`uploadfs`に圧縮処理が組み込まれる。
画像・SVG・音声、APIとSSEの配信形式は従来どおり。
ファームウェア領域の容量は増えないが、FS内の保存容量とWeb素材の転送量を削減できる。
SPIFFSは継続使用し、LittleFSへの移行は別の変更として扱う。
