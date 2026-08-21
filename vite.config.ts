import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@messages": path.resolve(import.meta.dirname, "./messages"),
      "@fixtures": path.resolve(import.meta.dirname, "./fixtures"),
    },
  },
  server: {
    port: 5173,
  },
});
