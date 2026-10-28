import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/mazify/",
  build: {
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, "index.html"),
        animations: resolve(import.meta.dirname, "animations.html"),
        draft: resolve(import.meta.dirname, "draft.html"),
      },
    },
  },
});
