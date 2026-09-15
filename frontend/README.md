# フロントエンド

SolidJS + TypeScript + Viteでセンサ表示・部品の操作とBlocklyを同じ画面に配置する。
PCでは左にtoolbox付きのブロックエディタ、右に温度・距離とLED・ブザーのスイッチを表示し、
狭い画面では縦に並べる。
Blocklyのサイズはパネルの幅・高さに追従する。ブロックは編集のみで、実行・保存は未実装。

部品のスイッチはESP32の応答を待ってから表示を切り替える。押した瞬間には変えない。
状態の正はESP32にあり、AST実行を始めたときも同じ経路で状態が届くようにしてある。
考え方と通信仕様は[adr/0001](../adr/0001-device-state-and-control.md)にまとめてある。

## PCでの開発

Node.js 22.12以降、pnpm 10.30.2を使用する。リポジトリのルートから実行する。

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

ターミナルに表示されるURLを開く。ダミーの温度・距離が1秒ごとに更新される。
ESP32やそのIPアドレスの設定は不要。画面にも「ダミー値」と表示する。
開発サーバーへLAN経由でアクセスした場合もダミー値になる。

## 確認・ビルド

`frontend/`で実行する。

```sh
pnpm check
pnpm build
pnpm preview
```

- `check`: TypeScriptの型検査。
- `build`: 型検査とBlockly素材の準備後、`dist/`へビルドし、gzip圧縮した実機用ファイルを`../data/web/`へ出力する。
- `preview`: ビルド成果物をPC上で確認する。localhost・127.0.0.1・[::1]で開いた場合はダミー値を表示する。

データ元は、Vite開発モードかローカルのプレビューならダミー、それ以外のビルド配信ではSSEとする。
ESP32を自動検出しているわけではないため、別のサーバーへビルドを配置した場合もSSE接続になる。
実機への接続が失敗してもダミー値には切り替えず、接続状態と`--`を表示する。
ダミーのときはスイッチも手元の状態だけが変わり、ESP32へは通信しない。

`dist/`はプレビュー用の未圧縮成果物、`data/web/`は実機用の成果物。どちらも自動生成専用で、
ビルド時に内容を置き換える。手書きのファイルは置かない。
`scripts/pack-web.mjs`でHTML・JS・CSSを圧縮し、容量が減るファイルは`.gz`だけを実機用に配置する。
Blocklyの画像・SVG・音声はそのままコピーする。ESP32は圧縮済みデータを配信し、ブラウザが展開する。
JS・CSSの出力名はハッシュを使って短くする。
圧縮方式の理由は[ADR 0003](../adr/0003-precompressed-web-assets.md)、
LittleFSへの移行は[ADR 0004](../adr/0004-littlefs-web-storage.md)を参照。
依存関係は`pnpm-lock.yaml`で固定し、生成物と`node_modules/`はGit管理しない。
Blockly素材は開発・ビルド時にパッケージから`static/media/`へ自動コピーする。外部CDNは使わない。

## ESP32での確認

ファームウェアはLittleFSの`/web/`から画面とJS・CSSを配信し、同じESP32の`/events`へ接続する。
ESPAsyncWebServerが通常のURLに対して`.gz`ファイルを見つけ、`Content-Encoding: gzip`付きで返す。
URLに`.gz`を付ける必要はない。
部品の一覧は`GET /api/devices`で取り、状態は`/events`の`devices`イベントで受ける。
取得できた温度は℃、距離はmmで表示する。初回はファームウェアとファイルシステムの両方の書き込みが必要。

ルートのREADMEに従ってWi-Fi設定を用意し、リポジトリのルートで実行する。

```sh
pio run -e esp32dev -t upload
pio run -e esp32dev -t uploadfs
pio device monitor
```

SPIFFSから移行する際も、上記の`upload`と`uploadfs`の両方を実行する。
旧SPIFFSの内容は自動変換されず、`uploadfs`でLittleFSイメージに置き換わる。
ファームウェアだけを書き込んだ直後はマウントに失敗するので、続けて`uploadfs`を実行する。
マウント失敗時はシリアルに案内を出し、自動フォーマットは行わない。

`platformio.ini`の`board_build.filesystem = littlefs`により、FSイメージは
`.pio/build/esp32dev/littlefs.bin`として生成される。
既定のパーティション名は互換性のため`spiffs`のままだが、その領域にLittleFS形式を書き込む。

`buildfs`・`uploadfs`は`scripts/build_frontend.py`が前処理として`frontend/`で`pnpm build`を実行するため、
手動でのビルドは不要になった。型検査やビルドが失敗した場合はファイルシステムイメージを作らずに中断する。
出来上がっている`data/web/`をそのまま焼きたいときは`SKIP_FRONTEND_BUILD=1`を付けて実行する。
`frontend/node_modules/`が無い場合は先に`pnpm install --frozen-lockfile`が要る。

シリアルモニターに表示されたESP32のIPアドレスをブラウザで開く。
起動時にLEDとブザーが一度動いてから消えるので、そこで配線を確認できる。
「ESP32（SSE）」「接続済み」と測定値、LEDとブザーのスイッチが表示されることを確認する。
スイッチを押して実機が反応し、表示も切り替わるところまで見る。
フロントエンドだけを変更した場合は、`uploadfs`だけで更新できる。

## 配置

```text
frontend/
  src/
    App.tsx                          # 画面の組み立て
    components/SensorPanel.tsx       # 温度・距離と接続状態の表示
    components/DeviceControlPanel.tsx # LED・ブザーのON/OFF
    components/BlocklyEditor.tsx     # パネル内のBlocklyの生成・リサイズ・破棄
    device/createDeviceStore.ts      # 部品の一覧・状態・操作。ダミーとSSEの切り替え
    device/dummyCatalog.ts           # PCで触るための仮の部品一覧
    device/types.ts                  # ESP32とそろえた型
    blockly/toolbox.ts               # カテゴリとブロックの配置
    blockly/deviceBlocks.ts          # 部品と待機の固定ブロック定義
    program/                         # 将来のAST変換・検証
  vite.config.ts
  scripts/pack-web.mjs               # 圧縮・実機用ファイルの配置
  dist/                             # 自動生成したプレビュー用ファイル（未圧縮）
  pnpm-lock.yaml
adr/                                 # 設計判断の記録
data/web/                            # 自動生成した配信用ファイル
src/main.cpp                         # 画面配信・SSE・部品の読み取りと配信
src/devices/                         # 部品の定義とON/OFF
src/api/                             # カタログ配信と操作の受け口
```
