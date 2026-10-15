# Blockly

`deviceBlocks.ts`に開始・無限ループ・待機・汎用部品ブロックを定義する。
`toolbox.ts`はカタログからセンサ・出力カテゴリを構成し、条件・繰り返し・数値の標準ブロックを並べる。
カタログの部品が追加されれば、同じ種別のブロックも追加される。

`BlocklyEditor`は開始ブロックを初期配置し、編集内容の世代を管理する。
センサ値更新ではワークスペースを再生成せず、カタログ変更時だけtoolboxを更新する。
Device fields retain saved IDs while the catalog is loading or a device is absent.
Catalog updates refresh their options and labels without changing the selected IDs.
実行用ASTへの変換は`program/compile.ts`。Blocklyの保存JSONとは分離する。

編集内容は`workspaceStorage.ts`経由でlocalStorageへ自動保存する。
保存は編集から400ms後、およびページ離脱時に行い、起動時に復元する。
保存データが壊れている、または形式版が異なる場合は破棄して開始ブロックのみを置く。
localStorageが使えない、容量超過などで保存できないまま編集が残る場合だけ、離脱前に確認ダイアログを出す。
