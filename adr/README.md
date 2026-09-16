# ADR（Architecture Decision Record）

後から理由を思い出せないと困る設計判断だけをここに残す。
1ファイル1決定、`NNNN-英小文字のタイトル.md`で連番を振る。

決定を変える場合は既存のファイルを書き換えず、新しいADRを追加して古い方のステータスを
「置き換え済み（ADR NNNN）」に変更する。

| 番号 | タイトル | ステータス |
| --- | --- | --- |
| [0001](0001-device-state-and-control.md) | 部品の状態表示と操作 | 一部置き換え済み（ADR 0006・0007） |
| [0002](0002-nonblocking-distance-sampling.md) | 距離センサの非ブロッキング読み取り | 一部置き換え済み（ADR 0007） |
| [0003](0003-precompressed-web-assets.md) | Web素材をビルド時にgzip圧縮する | 一部置き換え済み（ADR 0004） |
| [0004](0004-littlefs-web-storage.md) | Web素材の保存先をLittleFSに移行する | 採用 |
| [0005](0005-program-execution.md) | BlocklyのASTをESP32で実行する | 採用 |
| [0006](0006-program-control-exclusion.md) | 実行・停止と手動操作の排他 | 採用 |
| [0007](0007-sensor-validity.md) | センサ異常を数値0と区別する | 採用 |
