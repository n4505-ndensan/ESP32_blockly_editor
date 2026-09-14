# ADR（Architecture Decision Record）

後から理由を思い出せないと困る設計判断だけをここに残す。
1ファイル1決定、`NNNN-英小文字のタイトル.md`で連番を振る。

決定を変える場合は既存のファイルを書き換えず、新しいADRを追加して古い方のステータスを
「置き換え済み（ADR NNNN）」に変更する。

| 番号 | タイトル | ステータス |
| --- | --- | --- |
| [0001](0001-device-state-and-control.md) | 部品の状態表示と操作 | 採用 |
| [0002](0002-nonblocking-distance-sampling.md) | 距離センサの非ブロッキング読み取り | 採用 |
| [0003](0003-precompressed-web-assets.md) | Web素材をビルド時にgzip圧縮する | 一部置き換え済み（ADR 0004） |
| [0004](0004-littlefs-web-storage.md) | Web素材の保存先をLittleFSに移行する | 採用 |
