# 距離センサ停止の原因調査

## 今回変えた範囲

`SENSOR_DIAGNOSTICS`で、状態遷移・異常継続・センサ待ち・再接続のシリアルログを有効にします。
調査中はplatformio.iniのesp32devとacceptance_testで有効です。不要になったら各環境の同フラグを外して再ビルドしてください。
**Longモード、50ms測定予算、100ms周期、I2Cタイムアウト10msは変更していません。**
診断追加後、[ADR 0008](../adr/0008-held-distance-value.md)で一部の測距失敗に`held`を導入しました。
新規測定を正常と認める条件は変えず、利用可能な直近正常値を使う条件だけを追加しています。
Since [ADR 0011](../adr/0011-wait-for-sensor-and-reconnect.md), reading an invalid value makes the program wait instead of ending it with an error.
起動時には測定予算の確認用レジスタ読出しを追加しています。診断出力には時間がかかるため、計測無効時と全く同じタイミングではありません。
異常と復帰は即時、同じ異常が続く間は最大1秒に1回、正常継続中は出力しません。初回状態も1回出力します。
異常・正常が交互に続く場合は遷移ごとにログが出ます。

## 現在のセンサ状態と実行動作

| status | APIのvalue・画面 | 意味 |
| --- | --- | --- |
| ok | 数値 | 正常取得した利用可能な値 |
| held | 数値（okと同じ表示） | 距離のWrapTargetFail・SignalFail時に利用可能な直近正常値を使用 |
| unavailable | null・`--`と`reason`の説明 | 未取得、他の測距異常、検出したI2C異常などで利用不可 |
| stale | null・`--`と`reason`の説明 | 最後の正常取得から1000ms以上経過 |

`unavailable` and `stale` carry `reason` (`no_target`, `sensor_fault`, `disconnected`, `no_data`); see [ADR 0012](../adr/0012-sensor-failure-reasons.md) for the mapping from VL53L1X statuses.
A `stale` value keeps the reason of the failure before it, or `no_data` if there was none.

`held`は最後の正常取得から1000ms未満に限ります。保存値・正常取得時刻は更新せず、
失敗が続いても期限は延長しません。1000msちょうどで`stale`になります。
これは既存の鮮度1秒を使うプロジェクト上の判断で、メーカー由来の確立した保持定数ではありません。
500msの独立した猶予や、異常発生から追加の1秒は設けません。
他の測距異常・I2C異常は即座に無効化します。その後にWrapTargetFail・SignalFailが来ても、
保存されている過去値を復活させません。新しい正常測定だけが`ok`へ復旧させます。

実行器は`ok`・`held`を通常どおり評価し、一時中断・式のスキップはしません。
A sensor expression that reads `stale` or `unavailable` waits with outputs held until the value is usable again ([ADR 0011](../adr/0011-wait-for-sensor-and-reconnect.md)).
A sensor that delivers no measurement for 1000 ms is initialized again.

## ログの種類

- `SENSOR_CONFIG`：起動時の初期化結果、モード、測定予算、周期、I2C設定。
- `SENSOR`：距離センサの状態変化、測距ステータス、信号・外光強度、最後の正常取得からの時間、失敗数、published reason (`category`).
- `SENSOR_RUNTIME`: each change of the run state's `waiting`, with sensor, runId, blockId, status, sample time and stored value.
  `event` is `wait` when a program starts waiting for a sensor, `resume` when it has read a usable value, and `stop` when STOP ended the wait.
  When one tick ends a wait and starts another, both are logged in that order.
  Only the needed fields are captured under the runtime lock; the log is built and printed outside it.
- `SENSOR_RECONNECT`: each reinitialization attempt with sensor, bus and whether it succeeded.

`SENSOR_CONFIG`と`SENSOR`の`bus`は、距離センサがつながっているI2Cの組の番号（0または1）です。

`SENSOR.reason`：

| 値 | 意味 |
| --- | --- |
| ok | 正常な測距結果を保持 |
| no_sample | 初期化済みだが最初の正常測定がまだない |
| not_initialized | 初期化失敗 |
| data_ready_i2c | dataReady()直後のlast_statusが非0 |
| read_final_i2c | read(false)の最後のI2C書き込み結果が非0 |
| read_results_i2c | Results read failed: every result byte was `0xFF` (ADR 0012) |
| range_status | 通信の最終ステータスは0だが新規測定を正常と認めなかった。利用可否はstatusも確認 |
| stale | 最後の正常値が1秒以上更新されなかった |

`rangeStatusName`でsignal fail、sigma fail等を区別できます。
`SENSOR.category` is the `reason` the API publishes for the stored sample, or null while it is usable.
`reason`は測定失敗の理由、`status`は保存値の利用可否です。測距失敗のログだけでプログラムが待つと判断せず、
`held`か無効状態か、および`lastGoodAgeMs`を合わせて確認してください。
ただし、Pololuライブラリの`last_status`は最後の書き込み結果だけです。
A failed results read is detected by its `0xFF` signature instead (`read_results_i2c`); a failed `dataReady()` read is not detected and reads as "not ready".
`range_status`だった場合も光学的な測定不成立と断定せず、必要に応じてライブラリ内部を追加計測します。

`readAttempted=false`の行では測定結果を新たに読んでおらず、rangeStatusはnullです。
その際のreasonは直前の異常理由を引き継ぐ場合があります。
consecutiveFailuresは測定読出し・dataReady通信で失敗した回数です。単に次のデータ待ちのpollでは増やしません。
`lastGoodAgeMs=null`は正常値未取得。`reportedMm`と`storedValue`は診断値であり、無効時に制御へ使える値ではありません。
`SENSOR_RUNTIME.sampleUpdatedAtMs=0`は未取得時にも使われるため、そのsampleAgeMsを正常値の経過時間と解釈しないでください。

## 再現手順

1. シリアルモニターを閉じて、esp32devのファームウェアを書き込みます。held表示を確認する場合は対応するフロントエンドもビルドしてuploadfsします（診断ログだけの追加時とは異なります）。
2. 115200 baudでモニターを開きます。必要ならリセットしてSENSOR_CONFIGを取得します。
3. 元の「距離<100mm、温度>30℃、0.5秒待機」のプログラムを実行します。
4. 白い平面を5〜10cmに固定、前後移動、対象物を外す、の条件を別々に試します。近距離測定の限界確認は別試験とし、センサを覆い隠さない条件から始めます。
5. heldへの遷移、期限切れまたは即時無効化、待ち開始直前のSENSOR、SENSOR_RUNTIME（wait・resume・stop）、正常取得による復帰後のSENSORと、動かした対象物・照明条件を記録します。
6. Check the reasons: an empty field of view shows `no_target` and pauses the program; unplugging shows `disconnected` with `SENSOR_RECONNECT` lines; replugging resumes the program.
   Compare `SENSOR.category` with the screen. This needs both firmware (`upload`) and web assets (`uploadfs`).

許容対象の失敗が繰り返されてもlastGoodAgeMsがリセットされないこと、1000msでstaleとなること、
I2C異常等の即時無効化後に許容対象の失敗だけでは復旧しないことを確認します。
プログラムの待ちは状態変化そのものではなく、次にその無効値を参照する時点で確認してください。

同じ条件でブザーを操作しない版も比較できると、出力負荷や配線との相関を調べやすくなります。
初回は配線を変更せず、ログを優先してください。保持対象の拡大やShortモードへの変更は、この結果を見て別途判断します。

## 準備確認（2026-09-16）

以下はheld導入前の診断追加時点の記録です。held対応の検証結果ではありません。

- PC版Unity：既存19件＋診断履歴・ログ遷移・時刻周回の3件、合計22件成功。
- esp32devのビルドとCOM7への書き込み成功。LittleFSは変更していません。
- 起動ログでLong、budgetUs=49946（設定50msのレジスタ換算値）、periodMs=100、wireTimeoutMs=10を確認。
- 起動後15秒の取得でSENSOR_CONFIGと正常SENSORログを確認。実行エラーの再現はまだ行っていません。
- この確認時点では原因未確定で、診断ログの追加だけでした。held導入後も原因が解消したとはみなさず、元のプログラムによる保持・無効化・停止・復帰のログを確認対象とします。

## held実装のローカル検証（2026-09-16）

ADR 0008の実装後、PCで実行できる範囲だけを確認した記録です。**実機での再現確認は未実施です。**

| 検証 | 結果 |
| --- | --- |
| PC版Unity（`python scripts/test_runtime.py`） | 26件成功。うち4件がheldの新規テスト |
| Vitest（`pnpm test`） | 5ファイル64件成功。うち`sensorPresentation.test.ts`が新規 |
| `pnpm build`（型検査・Vite・配信用圧縮） | 成功 |
| `pio run -e esp32dev` | 成功。Flash 70.2%（920,049 bytes） |
| `git diff --check` | 成功 |

Unityの新規4件は、直近正常値だけを保持すること、失敗が値を捏造・復活させないこと、
時刻周回とSSE通知判定、実行器がheldを評価して期限で停止することを対象にしています。
Vite の500kB超チャンク警告は従来どおり残っています。

これらは状態遷移の規則を検証したもので、**実センサのWrapTargetFail・SignalFailが
実際にheldで吸収され、プログラムが停止しなくなることの確認ではありません。**
上記「再現手順」による実機確認が次の作業です。