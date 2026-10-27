// Bitmap fonts blur when 1 CSS px is a fractional number of device pixels,
// so zoom the page down to the nearest integer device pixel ratio.
export function lockPixelScale() {
  const dpr = window.devicePixelRatio;
  const scale = Math.max(1, Math.floor(dpr));
  document.documentElement.style.setProperty(
    "--page-zoom",
    String(scale / dpr),
  );

  // Browser zoom or moving to another monitor changes the ratio.
  matchMedia(`(resolution: ${dpr}dppx)`).addEventListener(
    "change",
    lockPixelScale,
    { once: true },
  );
}
