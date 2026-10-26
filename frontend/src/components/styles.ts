import { css } from "@acab/ecsstatic";

// Classes shared by several components. Component-specific classes live in each component file.

export const panel = css`
  min-width: 0;
  background: #fff;
  box-shadow: 0 3px 12px #20382d05;

  border-bottom: 1px solid #222222;

  &:last-child {
    border-bottom: none;
  }
`;

export const panelHeading = css`
  padding: 12px 16px;
  font-family: "Unbounded";

  @media (max-width: 720px) {
    padding: 16px 20px;
  }
`;

export const runButton = css`
  flex-shrink: 0;
  padding: 7px 12px;
  border: 1px solid #d3dfd9;
  border-radius: 8px;
  background: var(--color-accent);
  color: #ffffff;
  font: inherit;
  font-size: 14px;
  font-family: "Unbounded";
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #1b7ad8;
  }
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`;

export const ghostButton = css`
  flex-shrink: 0;
  padding: 5px 10px;
  border: 1px solid #d3dfd9;
  border-radius: 8px;
  background: #fff;
  color: #486557;
  font: inherit;
  font-size: 11px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #eef3f0;
  }
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`;
