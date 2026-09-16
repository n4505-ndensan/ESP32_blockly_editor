import { defineConfig, loadEnv } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, ".", "VITE_").VITE_ESP32_TARGET;
  return {
  plugins: [solid()],
  publicDir: "static",
  base: "./",
  server: {
    port: 3300,
    proxy: target ? { "/api": { target }, "/events": { target, timeout: 0, proxyTimeout: 0 } } : undefined,
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
  };
});
