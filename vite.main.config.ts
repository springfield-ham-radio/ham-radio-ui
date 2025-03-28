import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      external: ["serialport"], // Mark serialport as external
    },
  },
});
