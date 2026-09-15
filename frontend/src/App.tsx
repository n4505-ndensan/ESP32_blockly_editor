import BlocklyEditor from "./components/BlocklyEditor";
import DeviceControlPanel from "./components/DeviceControlPanel";
import SensorPanel from "./components/SensorPanel";
import { initDeviceStore } from "./device/connection";

export default function App() {
  initDeviceStore();

  return (
    <main class="app-shell">
      <header class="app-header">
        <h1 class="header-title">ESP32 Block Editor</h1>
        <button class="run-button">実行 / RUN</button>
      </header>

      <div class="workspace-layout">
        <section class="editor-panel panel" aria-labelledby="editor-title">
          <BlocklyEditor />
        </section>

        <div class="side-column">
          <SensorPanel />
          <DeviceControlPanel />
        </div>
      </div>
    </main>
  );
}
