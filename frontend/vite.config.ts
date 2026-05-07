import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget =
    env.VITE_API_PROXY_TARGET || env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: "es2020",
      sourcemap: true,
      chunkSizeWarningLimit: 1300,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (!id.includes("node_modules")) return;
            if (id.includes("monaco-editor") || id.includes("@monaco-editor")) {
              return "vendor-monaco";
            }
            if (id.includes("echarts") || id.includes("zrender")) {
              return "vendor-echarts";
            }
            if (id.includes("@tanstack")) {
              return "vendor-query";
            }
            // Keep react-router and its deps in the same chunk as react to avoid
            // circular references.
            if (
              id.includes("react-router") ||
              id.includes("@remix-run/router") ||
              id.includes("react-dom") ||
              id.includes("/react/") ||
              id.includes("scheduler") ||
              id.includes("history") ||
              id.includes("use-sync-external-store")
            ) {
              return "vendor-react";
            }
            // Group all of antd's dependency tree together (incl. rc-*, @rc-*,
            // dom-align, dayjs, async-validator, etc.) so they don't end up in
            // a generic vendor chunk that would import react and form cycles.
            return "vendor-antd";
          },
        },
      },
    },
  };
});
