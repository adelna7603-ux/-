import { defineConfig } from "vite";

export default defineConfig({
  appType: "mpa",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        admin: "admin/index.html"
      }
    }
  }
});