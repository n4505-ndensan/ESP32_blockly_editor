# HTTP API

| 経路 | 内容 |
| --- | --- |
| GET /api/devices | 部品カタログと全状態、bootId、revision |
| POST /api/devices/command | `{id,action:"set",on}`。200で確定した状態、bootId、revision |
| POST /api/program/run | `{version:1,body:[...]}`を検証し、202で開始受付時の実行状態 |
| POST /api/program/stop | 停止と全出力OFF。202で受付時の実行状態 |
| GET /api/program/state | 現在の実行状態 |
| GET /api/settings/devices | 部品リスト`{candidatePins,parts}`。起動時に読み込んだもの |
| POST /api/settings/devices | `{parts}`で部品リスト全体を置き換え。200`{restarting:true}`の後に再起動 |
| SSE /events | devicesとprogram。接続直後は両方のスナップショット |

実行状態は`{bootId,revision,runId,state,error,waiting}`。
stateはidle/starting/running/stopping/completed/stopped/error。
errorはnull、または`{code,message,blockId}`。
`waiting` is null, or `{deviceId,blockId}` while a running program waits for a usable sensor value (ADR 0011).
202は受付であり、完了はSSEまたはGETで確認する。
開始要求は自動再送しない。停止は冪等。

プログラムのエラー応答は`{error,message,blockId?}`。
400: JSON不正、409: 実行中・送信中に停止・部品リスト反映の再起動待ち、413: サイズ・深度超過、422: AST不正、503: メモリ不足。
実行中の個別手動操作も409で拒否する。プログラムの検証失敗では出力を変更しない。

devicesイベントは`{ts,bootId,revision,devices:[{id,state}]}`。
出力のstateは`{on}`、センサは`{value,status,reason}`。
`value` is a number for `ok`/`held` and null for `unavailable`/`stale` (ADR 0007, ADR 0008).
`reason` is null while the value is usable, otherwise `no_target`/`sensor_fault`/`disconnected`/`no_data` (ADR 0012).
The wait does not depend on `reason`.
実行器の操作も既存のdevices配信に反映する。

プログラム受信はContent-Length付きのapplication/jsonを使う。TCPの分割受信に対応し、
中断時に受信バッファを解放する。長さ不明のchunkedリクエストは受け付けない。
上限と排他はADR 0005・0006・0007を参照。

部品リストの保存は実行中なら409、規則違反は422`invalid_settings`（`message`に理由）。
保存はNVSに行い、約0.5秒後に再起動して反映する。詳細はADR 0009を参照。
