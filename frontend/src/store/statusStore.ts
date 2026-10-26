import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import type { EditorHandle } from "~/components/editor/BlocklyEditor";
import type { ProgramError } from "~/program/types";

export type SentProgram = { revision: number; bootId: string; runId: number };

type Model = {
  /** エディタの編集回数。 */
  revision: number;
  /** 確認・実行時に見つかったブロックの問題。 */
  diagnostic: ProgramError | null;
  /** 最後に受け付けられた実行。 */
  sent: SentProgram | null;
  /** 最後に確認・実行を試みた時点の編集回数。 */
  attemptRevision: number | null;
  validated: boolean;
};

const [statusStore, setStatusStore] = createStore<Model>({
  revision: 0,
  diagnostic: null,
  sent: null,
  attemptRevision: null,
  validated: false,
});
export { statusStore };
export const updateStatusStore = (patch: Partial<Model>) =>
  setStatusStore(patch);

// EditorHandleは関数の集まりなので、ストアのプロキシに包まずシグナルで持つ。
const [editor, setEditor] = createSignal<EditorHandle>();
export { editor, setEditor };
