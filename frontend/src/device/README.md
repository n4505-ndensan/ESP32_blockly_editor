# 部品の状態と操作

部品の一覧・状態・操作は3つに分かれている。
センサも出力部品も同じ一覧に入り、違いは`control`が`switch`か`none`かだけになる。

- `store/deviceStore.ts`：状態そのものと、それを書き換えるための最小の関数。
  `setDeviceStore`は外に出さないので、更新経路はここに列挙されたものだけになる。
  ダミーか実機かを表す`deviceSource`は起動後に変わらないため、ストアに入れず定数で持つ。
- `connection.ts`：ESP32からストアへ流し込む側。カタログの取得・SSE・ダミー値の生成。
- `actions.ts`：画面からの操作。実行中の個別操作を禁止し、`turnAllOff`は実行停止を要求する。
- `session.ts`：接続先の選択と、部品ごとの状態更新番号の管理。

状態更新は`store/deviceStore.ts`のプリミティブを通す。実行状態は`store/programStore.ts`で管理する。
接続は共通のSSEからdevicesとprogramを受ける。

- Vite開発時、またはlocalhost・127.0.0.1・[::1]のプレビュー時：
  `dummyCatalog.ts`の仮の一覧を使い、センサ値を1秒ごとに更新する。ESP32へ通信しない。
  スイッチは手元の状態だけが変わる。Viteで`VITE_ESP32_TARGET`を指定した場合は実機へ接続する。
- ESP32から配信したビルド：`GET /api/devices`で一覧を取り、`/events`の`devices`イベントで状態を受ける。

状態の正はESP32にあり、画面は楽観更新をしない。
スイッチを押しても表示はすぐ変わらず、`POST /api/devices/command`の応答か
その後の`devices`イベントで確定した状態だけを反映する。
送信中の部品は操作を受け付けず、押した見た目のまま待つ。

AST実行を始めると部品はプログラム側から動くが、変化は同じ`devices`イベントで届く。
発生元が手動でもASTでも画面の作りは変わらない。

接続が切れたときはセンサ値を消して接続状態を表示する。ダミー値へ切り替えることはない。
出力の状態は、再接続時にESP32が送るスナップショットで揃う。
カタログ取得後にSSEを開始し、devices・program両方のスナップショットを待つ。
センサ状態は`{value:number|null,status:"ok"|"held"|"unavailable"|"stale"}`。
`ok`は正常値、`held`は利用可能な直近正常値で、どちらもAPIのvalueは数値。
`sensorPresentation.ts`で表示を変換し、`held`は数値・単位と「直近値を使用中」を表示する。
`unavailable`・`stale`は`value:null`で、画面は`--`と理由を表示する。
保持・鮮度の判定はESP32で行い、ブラウザでは過去値の保持や期限延長をしない。
距離のWrapTargetFail・SignalFailだけが保持対象で、期限は最後の正常取得から1000ms未満。
他の異常やI2C異常による即時無効化後は、新規正常測定まで復旧しない。

`dummyCatalog.ts`はPCだけでUIを触るための写しで、部品の定義そのものは
ファームウェア（`src/devices/devices.cpp`）が持つ。

通信仕様は[adr/0001](../../../adr/0001-device-state-and-control.md)、
センサ有効性は[adr/0007](../../../adr/0007-sensor-validity.md)と
[adr/0008](../../../adr/0008-held-distance-value.md)を参照。
