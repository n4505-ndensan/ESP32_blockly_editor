import { render } from "solid-js/web";
// Global base styles first, so component styles from ecsstatic come after them.
import "./styles.css";
import App from "./App";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found.");
}

render(() => <App />, root);
