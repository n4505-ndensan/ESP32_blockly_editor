# ADR（Architecture Decision Record）

後から理由を思い出せないと困る設計判断だけをここに残す。
1ファイル1決定、`NNNN-英小文字のタイトル.md`で連番を振る。

決定を変える場合は既存のファイルを書き換えず、新しいADRを追加して古い方のステータスを
「置き換え済み（ADR NNNN）」に変更する。

| 番号                                          | タイトル                                   | ステータス                         |
| --------------------------------------------- | ------------------------------------------ | ---------------------------------- |
| [0001](0001-device-state-and-control.md)      | 部品の状態表示と操作                       | 一部置き換え済み（ADR 0006・0007・0009・0013） |
| [0002](0002-nonblocking-distance-sampling.md) | 距離センサの非ブロッキング読み取り         | 一部置き換え済み（ADR 0007・0011） |
| [0003](0003-precompressed-web-assets.md)      | Web素材をビルド時にgzip圧縮する            | 一部置き換え済み（ADR 0004）       |
| [0004](0004-littlefs-web-storage.md)          | Web素材の保存先をLittleFSに移行する        | 一部置き換え済み（ADR 0010）       |
| [0005](0005-program-execution.md)             | BlocklyのASTをESP32で実行する              | 採用                               |
| [0006](0006-program-control-exclusion.md)     | 実行・停止と手動操作の排他                 | 採用                               |
| [0007](0007-sensor-validity.md)               | センサ異常を数値0と区別する                | 一部置き換え済み（ADR 0008・0011・0012） |
| [0008](0008-held-distance-value.md)           | 一部の測距失敗では鮮度内の直近正常値を使う | 一部置き換え済み（ADR 0011・0012） |
| [0009](0009-device-list-settings.md)         | 部品リストを画面から編集できる設定値にする | 採用                               |
| [0010](0010-single-app-partition-layout.md)  | Give the second app slot to LittleFS       | 採用                               |
| [0011](0011-wait-for-sensor-and-reconnect.md) | Wait for an unusable sensor and reconnect it | Partially replaced (ADR 0012)    |
| [0012](0012-sensor-failure-reasons.md)        | Keep waiting on unusable sensor values and publish the reason | Accepted          |
| [0013](0013-setup-status-indicator.md)        | Report setup progress and failures with the kit LEDs and buzzer | Accepted        |
