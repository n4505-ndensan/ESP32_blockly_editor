import { css } from "@acab/ecsstatic";
import { createSignal } from "solid-js";
import SettingsDialog from "~/components/dialog/SettingsDialog";
import EditorArea from "~/components/EditorArea";
import Header from "~/components/Header";
import SideBar from "~/components/SideBar";
import TopInfoBar from "~/components/TopInfoBar";
import { initDeviceStore } from "~/device/connection";

export default function App() {
  initDeviceStore();

  const [settingsOpen, setSettingsOpen] = createSignal(false);

  return (
    <main class={appShell}>
      <SettingsDialog
        open={settingsOpen()}
        onClose={() => setSettingsOpen(false)}
      />
      <Header onOpenSettings={() => setSettingsOpen(true)} />
      <div class={layout}>
        <TopInfoBar />
        <div class={workspaceLayout}>
          <EditorArea />
          <SideBar />
        </div>
      </div>
    </main>
  );
}

const appShell = css`
  display: flex;
  flex-direction: column;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0;
  min-height: 100dvh;
  height: 100dvh;
  box-sizing: border-box;
  padding-top: 4px;
  padding-bottom: 24px;

  @media (max-width: 720px) {
    padding-top: 20px;
  }
`;

const layout = css`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  border-radius: 8px;
  border: 1px solid #111;
  box-shadow: 0 2px 10px rgba(125, 125, 125, 0.5);

  overflow: hidden;
`;

const workspaceLayout = css`
  display: grid;
  flex: 1;
  min-height: 0;
  height: 100%;
  grid-template-columns: minmax(0, 1fr) 400px;

  @media (max-width: 900px) {
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 16px;
  }
  @media (max-width: 720px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
