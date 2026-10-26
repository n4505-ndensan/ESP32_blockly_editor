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
const TutorialTab: Component = () => {
  return (
    <div class={tutorialList}>
      <div class={card}>
        <p>
          1. 左側のカテゴリからブロックを選び、
          <br />
          「開始」ブロックの後に配置してみましょう
        </p>
        <img src={"/images/tutorial_1.webp"} />
      </div>
      <div class={card}>
        <p>2. ON/OFFする部品はブロック上から変えられます</p>
        <img src={"/images/tutorial_2.webp"} />
      </div>
      <div class={card}>
        <p>3. プログラムが完成したら、実行ボタンを押してみましょう</p>
        <img src={"/images/tutorial_3.webp"} />
      </div>
    </div>
  );
};

export default TutorialTab;
