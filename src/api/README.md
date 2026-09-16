# HTTP API

| 経路 | 内容 |
| --- | --- |
| GET /api/devices | 部品カタログと全状態、bootId、revision |
| POST /api/devices/command | `{id,action:"set",on}`。200で確定した状態、bootId、revision |
| POST /api/program/run | `{version:1,body:[...]}`を検証し、202で開始受付時の実行状態 |
| POST /api/program/stop | 停止と全出力OFF。202で受付時の実行状態 |
| GET /api/program/state | 現在の実行状態 |
| SSE /events | devicesとprogram。接続直後は両方のスナップショット |

実行状態は`{bootId,revision,runId,state,error}`。
stateはidle/starting/running/stopping/completed/stopped/error。
errorはnull、または`{code,message,blockId}`。202は受付であり、完了はSSEまたはGETで確認する。
開始要求は自動再送しない。停止は冪等。

プログラムのエラー応答は`{error,message,blockId?}`。
400: JSON不正、409: 実行中または送信中に停止、413: サイズ・深度超過、422: AST不正、503: メモリ不足。
実行中の個別手動操作も409で拒否する。プログラムの検証失敗では出力を変更しない。

devicesイベントは`{ts,bootId,revision,devices:[{id,state}]}`。
出力のstateは`{on}`、センサは`{value:number|null,status:"ok"|"unavailable"|"stale"}`。
実行器の操作も既存のdevices配信に反映する。

プログラム受信はContent-Length付きのapplication/jsonを使う。TCPの分割受信に対応し、
中断時に受信バッファを解放する。長さ不明のchunkedリクエストは受け付けない。
上限と排他はADR 0005・0006・0007を参照。
