import BlocklyEditor from "./components/BlocklyEditor";
import DeviceDirectControlPanel from "./components/DeviceDirectControlPanel";
import SensorPanel from "./components/SensorPanel";
import { createDeviceStore } from "./device/createDeviceStore";

export default function App() {
  const store = createDeviceStore();

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
          <SensorPanel store={store} />
          <DeviceDirectControlPanel store={store} />
        </div>
      </div>
    </main>
  );
}
