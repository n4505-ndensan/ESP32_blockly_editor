import { css } from "@acab/ecsstatic";
import { createSignal, For, Match, Switch, type Component } from "solid-js";
import ButtonArea from "~/components/sidebar/ButtonArea";
import PartsInfoTab from "~/components/sidebar/PartsInfoTab";
import TemplatesTab from "~/components/sidebar/TemplatesTab";
import TutorialTab from "~/components/sidebar/TutorialTab";

const sideColumn = css`
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  flex: 1;
  background: #fff;
  border-left: 1px solid #aaa;
  overflow-y: hidden;

  @media (max-width: 900px) {
    gap: 16px;
  }
`;

const sidebarTabContainer = css`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: hidden;
`;
const sidebarTabs = css`
  display: flex;
  flex-direction: row;
  width: 100%;
  padding: 8px;
  gap: 8px;
  border-bottom: 1px solid lightgray;
`;
const sidebarTabItem = css`
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  background: #f2f2f2;

  &:hover {
    background: #ddd;
  }
  &[aria-checked="true"] {
    color: white;
    background: var(--color-accent);
    font-weight: bold;
  }

  &:first-child {
    margin-right: auto;
  }
`;
const sidebarTabContent = css`
  overflow-x: hidden;
  overflow-y: auto;
  gap: 12px;
`;

export enum SidebarTab {
  PARTS_INFO = "部品情報",
  TUTORIAL = "実行方法",
  TEMPLATES = "テンプレート",
}

const [currentTab, setCurrentTab] = createSignal<SidebarTab>(
  SidebarTab.PARTS_INFO,
);

export function setCurrentSidebarTab(tab: SidebarTab) {
  setCurrentTab(tab);
}

const SideBar: Component = () => {
  return (
    <div class={sideColumn}>
      <div class={sidebarTabContainer}>
        <div class={sidebarTabs}>
          <For each={Object.entries(SidebarTab)}>
            {(entry, _i) => {
              const [_key, value] = entry;
              return (
                <p
                  class={sidebarTabItem}
                  aria-checked={currentTab() === value}
                  onClick={() => setCurrentTab(value)}
                >
                  {value}
                </p>
              );
            }}
          </For>
        </div>
        <div class={sidebarTabContent}>
          <Switch>
            <Match when={currentTab() === SidebarTab.PARTS_INFO}>
              <PartsInfoTab />
            </Match>
            <Match when={currentTab() === SidebarTab.TUTORIAL}>
              <TutorialTab />
            </Match>
            <Match when={currentTab() === SidebarTab.TEMPLATES}>
              <TemplatesTab />
            </Match>
          </Switch>
        </div>
      </div>
      <ButtonArea />
    </div>
  );
};

export default SideBar;
