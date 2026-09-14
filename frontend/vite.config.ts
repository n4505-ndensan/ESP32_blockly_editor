import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  publicDir: "static",
  base: "./",
  server: {
    port: 3300,
  },
  build: {
    // Generated files only; replaced on each build.
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        // Keep compact, content-hashed URLs for deployed assets.
        entryFileNames: "assets/[hash].js",
        chunkFileNames: "assets/[hash].js",
        assetFileNames: "assets/[hash][extname]",
      },
    },
  },
});
