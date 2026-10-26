import { css } from "@acab/ecsstatic";
import type { Component } from "solid-js";
import DeviceControlPanel from "~/components/sidebar/parts_info/DeviceControlPanel";
import SensorPanel from "~/components/sidebar/parts_info/SensorPanel";

const container = css`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const PartsInfoTab: Component = () => {
  return (
    <div class={container}>
      <SensorPanel />
      <DeviceControlPanel />
    </div>
  );
};

export default PartsInfoTab;
