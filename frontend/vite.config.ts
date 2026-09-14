import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  publicDir: "static",
  base: "./",
  build: {
    // Generated files only; replaced on each build.
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        // SPIFFS allows 31 bytes including directories; leave room for .gz.
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash][extname]",
      },
    },
  },
});
