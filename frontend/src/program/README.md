# プログラム

- `types.ts`：実行用ASTと実行状態の型・上限。
- `compile.ts`：開始ブロックにつながるBlocklyブロックをASTへ変換する。
- `validate.ts`：型・部品・大きさを実行前に検証する。
- `client.ts`：HTTP要求とSSE状態の順序管理。SolidやBlocklyには依存しない。
- `actions.ts`：画面からのRUN・STOPと、`store/programStore.ts`への反映。

JSONは`{version:1,body:Statement[]}`。全ノードに`blockId`を付ける。
文はset_output、wait、if、repeat、while、forever。
式はnumber、boolean、sensor、arithmetic、compare、logic、not。
フィールドの仕様は`types.ts`、双方で使う実例は`shared/program-fixtures.json`が基準になる。

開始ブロックは1つ。非接続ブロックは実行せず、空の開始・未接続入力・未対応ブロックはエラーにする。
編集は実行中も可能だが、変更は次回RUNから有効。保存・復元は行わない。

センサ式は`ok`・`held`の数値を通常どおり評価する。保持中に一時中断したり式をスキップしたりしない。
A sensor expression that reads `stale` or `unavailable` waits at that block with outputs held until the value is usable again.
The run state's `waiting` names the sensor and block; see [ADR 0011](../../../adr/0011-wait-for-sensor-and-reconnect.md).
Sensors that are not read, including those skipped by short-circuit evaluation, never cause a wait.
保持の条件と正常取得から1秒の期限は[ADR 0008](../../../adr/0008-held-distance-value.md)を参照。

Vitestを先行させて実装する。`pnpm test`で実行、`pnpm test:watch`で監視する。
