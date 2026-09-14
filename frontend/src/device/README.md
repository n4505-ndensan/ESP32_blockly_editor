# 部品の状態と操作

部品の一覧・状態・操作は3つに分かれている。
センサも出力部品も同じ一覧に入り、違いは`control`が`switch`か`none`かだけになる。

- `store/deviceStore.ts`：状態そのものと、それを書き換えるための最小の関数。
  `setDeviceStore`は外に出さないので、更新経路はここに列挙されたものだけになる。
  ダミーか実機かを表す`deviceSource`は起動後に変わらないため、ストアに入れず定数で持つ。
- `connection.ts`：ESP32からストアへ流し込む側。カタログの取得・SSE・ダミー値の生成。
- `actions.ts`：画面からの操作。`setOutput`と`turnAllOff`だけ。

どれも`store/deviceStore.ts`へ一方向に依存する。

- Vite開発時、またはlocalhost・127.0.0.1・[::1]のプレビュー時：
  `dummyCatalog.ts`の仮の一覧を使い、センサ値を1秒ごとに更新する。ESP32へ通信しない。
  スイッチは手元の状態だけが変わる。
- ESP32から配信したビルド：`GET /api/devices`で一覧を取り、`/events`の`devices`イベントで状態を受ける。

状態の正はESP32にあり、画面は楽観更新をしない。
スイッチを押しても表示はすぐ変わらず、`POST /api/devices/command`の応答か
その後の`devices`イベントで確定した状態だけを反映する。
送信中の部品は操作を受け付けず、押した見た目のまま待つ。

AST実行を始めると部品はプログラム側から動くが、変化は同じ`devices`イベントで届く。
発生元が手動でもASTでも画面の作りは変わらない。

接続が切れたときはセンサ値を消して接続状態を表示する。ダミー値へ切り替えることはない。
出力の状態は、再接続時にESP32が送るスナップショットで揃う。

`dummyCatalog.ts`はPCだけでUIを触るための写しで、部品の定義そのものは
ファームウェア（`src/devices/devices.cpp`）が持つ。

通信仕様は[adr/0001](../../../adr/0001-device-state-and-control.md)を参照。
