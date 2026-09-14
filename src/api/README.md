# HTTP API

`device_api.cpp`が部品のカタログ配信・操作・状態通知を扱う。
ASTの登録、プログラムの実行・停止のハンドラもここに置く（未実装）。

| | |
| --- | --- |
| `GET /api/devices` | カタログと現在の状態 |
| `POST /api/devices/command` | `{"id":..., "action":"set", "on":true}`。成功時は確定した状態を返す |
| SSE `/events`の`devices`イベント | 変化した部品のIDと状態。接続直後は全部品を1回送る |

操作は冪等な`set`だけを受け、`toggle`は持たない。
現在の状態に依存する操作は、AST実行中に画面が古い状態を持っていると意図と逆の結果になる。

エラーは`error`コードとHTTPステータスで返す。
`bad_request`(400) / `unknown_device`(404) / `unsupported_action`(422)。

仕様とその理由は[adr/0001](../../adr/0001-device-state-and-control.md)にまとめてある。
