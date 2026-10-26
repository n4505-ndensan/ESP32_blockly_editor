import { css } from "@acab/ecsstatic";
import type { Component } from "solid-js";

const tutorialList = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
`;
const card = css`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  overflow: hidden;
  width: 100%;
  height: auto;
  border-radius: 6px;
  background: #eee;
`;
const tutorialImages = [
  "/images/tutorial_1.webp",
  "/images/tutorial_2.webp",
  "/images/tutorial_3.webp",
] as const;

// Fetch the images ahead of time so the tab does not wait on the ESP32 when first opened.
export function preloadTutorialImages() {
  for (const src of tutorialImages) new Image().src = src;
}

const TutorialTab: Component = () => {
  return (
    <div class={tutorialList}>
      <div class={card}>
        <p>
          1. 左側のカテゴリからブロックを選び、
          <br />
          「開始」ブロックの後に配置してみましょう
        </p>
        <img src={tutorialImages[0]} />
      </div>
      <div class={card}>
        <p>2. ON/OFFする部品はブロック上から変えられます</p>
        <img src={tutorialImages[1]} />
      </div>
      <div class={card}>
        <p>3. プログラムが完成したら、実行ボタンを押してみましょう</p>
        <img src={tutorialImages[2]} />
      </div>
    </div>
  );
};

export default TutorialTab;
