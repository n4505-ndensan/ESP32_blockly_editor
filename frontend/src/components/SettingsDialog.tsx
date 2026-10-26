import { createEffect, createMemo, createSignal, For, Index, Match, Show, Switch } from "solid-js";
import { loadSettings, saveSettings } from "../settings/client";
import { defaultLabel, defaultPins, MAX_PARTS, nextPartId, pinOwners, validateSettings } from "../settings/rules";
import { PART_TYPES } from "../settings/types";
import type { DeviceSettings, Part, PartType } from "../settings/types";

const typeChoices = Object.entries(PART_TYPES) as [PartType, (typeof PART_TYPES)[PartType]][];

function PinSelect(props: { value: number | undefined; choices: readonly number[]; note: (pin: number) => string; label: string; onChange: (pin: number) => void }) {
  // 候補外のピンが保存されていても、選択中の値として見えるようにする。
  const choices = () => (props.value === undefined || props.choices.includes(props.value) ? props.choices : [props.value, ...props.choices]);
  return (
    <select aria-label={props.label} onChange={(event) => props.onChange(Number(event.currentTarget.value))}>
      <Show when={props.value === undefined}>
        <option value="" disabled selected>選択</option>
      </Show>
      <For each={choices()}>{(pin) => <option value={pin} selected={pin === props.value}>GPIO{pin}{props.note(pin)}</option>}</For>
    </select>
  );
}

/** ピン欄は2列。LED・ブザーは1列目だけ、I2Cのセンサは[SDA, SCL]を使う。 */
function PinCells(props: {
  type: PartType;
  pins: readonly (number | undefined)[];
  choices: readonly number[];
  note: (pin: number) => string;
  label: string;
  onChange: (pins: (number | undefined)[]) => void;
}) {
  const set = (index: number, pin: number) => {
    const next = [...props.pins];
    next[index] = pin;
    props.onChange(next);
  };
  const i2c = () => PART_TYPES[props.type].i2c;
  return (
    <>
      <td>
        <PinSelect value={props.pins[0]} choices={props.choices} note={props.note} label={`${props.label}の${i2c() ? "SDA" : "ピン"}`} onChange={(pin) => set(0, pin)} />
      </td>
      <td>
        <Show when={i2c()}>
          <PinSelect value={props.pins[1]} choices={props.choices} note={props.note} label={`${props.label}のSCL`} onChange={(pin) => set(1, pin)} />
        </Show>
      </td>
    </>
  );
}

/** 部品リストなどの設定。編集は下書きに対して行い、保存したときだけ反映する。 */
export default function SettingsDialog(props: { open: boolean; onClose: () => void }) {
  let dialog!: HTMLDialogElement;
  const [candidatePins, setCandidatePins] = createSignal<number[]>();
  const [parts, setParts] = createSignal<Part[]>([]);
  const [newType, setNewType] = createSignal<PartType>("led");
  const [newLabel, setNewLabel] = createSignal("");
  const [newPins, setNewPins] = createSignal<(number | undefined)[]>([]);
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [restarting, setRestarting] = createSignal(false);

  const draft = createMemo<DeviceSettings | undefined>(() => {
    const pins = candidatePins();
    return pins && { candidatePins: pins, parts: parts() };
  });
  const problems = createMemo(() => {
    const current = draft();
    return current ? validateSettings(current) : [];
  });
  const owners = createMemo(() => pinOwners(parts()));
  /** 選択肢の横に、そのピンを使っている他の部品の名前を出す。 */
  const noteFor = (self: number) => (pin: number) => {
    const names = (owners().get(pin) ?? [])
      .filter((index) => index !== self)
      .map((index) => parts()[index].label.trim() || PART_TYPES[parts()[index].type].name);
    return names.length ? `（${names.join("・")}）` : "";
  };

  const resetNewRow = (type: PartType) => {
    const current = draft();
    setNewType(type);
    setNewLabel("");
    setNewPins(current ? defaultPins(type, current) : []);
  };
  const canAdd = () =>
    parts().length < MAX_PARTS &&
    newPins().length === (PART_TYPES[newType()].i2c ? 2 : 1) &&
    newPins().every((pin) => pin !== undefined);

  const reset = async () => {
    setCandidatePins(undefined);
    setError(null);
    setRestarting(false);
    try {
      const settings = await loadSettings();
      setParts(settings.parts);
      setCandidatePins(settings.candidatePins);
      resetNewRow("led");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "設定を読み込めませんでした。");
    }
  };

  createEffect(() => {
    if (props.open) {
      if (!dialog.open) dialog.showModal();
      void reset();
    } else if (dialog.open) dialog.close();
  });

  const update = (index: number, patch: Partial<Part>) =>
    setParts((list) => list.map((part, i) => (i === index ? { ...part, ...patch } : part)));

  const add = () => {
    if (!canAdd()) return;
    const type = newType();
    const part: Part = { id: nextPartId(type, parts()), type, label: newLabel().trim() || defaultLabel(type, parts()), pins: newPins() as number[] };
    setParts([...parts(), part]);
    resetNewRow(type);
  };

  const save = async () => {
    if (!draft() || problems().length || saving()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveSettings(parts().map((part) => ({ ...part, label: part.label.trim() })));
      if (result === "restarting") setRestarting(true);
      else props.onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialog} class="settings-dialog" aria-labelledby="settings-title" onClose={() => props.onClose()}>
      <h2 id="settings-title" class="panel-heading settings-title">設定</h2>

      <section class="settings-section" aria-labelledby="settings-parts-title">
        <h3 id="settings-parts-title">部品リスト</h3>
        <Switch fallback={<p class="settings-message">{error() ?? "読み込み中…"}</p>}>
          <Match when={restarting()}>
            <p class="settings-message" role="status">保存しました。ESP32を再起動して反映します。再接続まで数秒かかります。</p>
          </Match>
          <Match when={candidatePins()}>
            {(pins) => (
              <table class="settings-table">
                <thead>
                  <tr>
                    <th scope="col">種類</th>
                    <th scope="col">名前</th>
                    <th scope="col">ピン / SDA</th>
                    <th scope="col">SCL</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <Index each={parts()}>
                    {(part, index) => (
                      <tr>
                        <td>{PART_TYPES[part().type].name}</td>
                        <td>
                          <input value={part().label} aria-label="名前" onInput={(event) => update(index, { label: event.currentTarget.value })} />
                        </td>
                        <PinCells
                          type={part().type}
                          pins={part().pins}
                          choices={pins()}
                          note={noteFor(index)}
                          label={part().label}
                          onChange={(next) => update(index, { pins: next as number[] })}
                        />
                        <td>
                          <button type="button" class="ghost-button" onClick={() => setParts(parts().filter((_, i) => i !== index))}>削除</button>
                        </td>
                      </tr>
                    )}
                  </Index>
                </tbody>
                <tfoot>
                  <tr>
                    <td>
                      <select aria-label="追加する部品の種類" onChange={(event) => resetNewRow(event.currentTarget.value as PartType)}>
                        <For each={typeChoices}>{([value, info]) => <option value={value} selected={value === newType()}>{info.name}</option>}</For>
                      </select>
                    </td>
                    <td>
                      <input
                        value={newLabel()}
                        aria-label="追加する部品の名前"
                        placeholder={defaultLabel(newType(), parts())}
                        onInput={(event) => setNewLabel(event.currentTarget.value)}
                      />
                    </td>
                    <PinCells type={newType()} pins={newPins()} choices={pins()} note={noteFor(-1)} label="追加する部品" onChange={setNewPins} />
                    <td>
                      <button type="button" class="ghost-button settings-add-button" disabled={!canAdd()} onClick={add}>追加</button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Match>
        </Switch>
      </section>

      <Show when={!restarting() && draft() && (error() ? [error()!] : problems()).length > 0}>
        <ul class="settings-problems" role="alert">
          <For each={error() ? [error()!] : problems()}>{(message) => <li>{message}</li>}</For>
        </ul>
      </Show>

      <div class="settings-actions">
        <Show when={!restarting()} fallback={<button type="button" class="ghost-button" onClick={() => props.onClose()}>閉じる</button>}>
          <button type="button" class="ghost-button" onClick={() => props.onClose()}>キャンセル</button>
          <button type="button" class="run-button" disabled={!draft() || problems().length > 0 || saving()} onClick={() => void save()}>保存</button>
        </Show>
      </div>
    </dialog>
  );
}
