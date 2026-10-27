import { render } from "solid-js/web";
// Global base styles first, so component styles from ecsstatic come after them.
import App from "~/App";
import { preloadTutorialImages } from "~/components/sidebar/TutorialTab";
import { lockPixelScale } from "~/pixelScale";
import "~/styles.css";

lockPixelScale();

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found.");
}

render(() => <App />, root);

// Wait for the initial assets so the ESP32 serves them first.
window.addEventListener("load", preloadTutorialImages, { once: true });
