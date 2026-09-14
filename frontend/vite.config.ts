import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  publicDir: "static",
  base: "./",
  build: {
    // Generated files only; replaced on each build.
    outDir: "../data/web",
    emptyOutDir: true,
  },
});
