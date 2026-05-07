import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

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
            // 将 react-router 及其依赖与 react 打入同包，避免分包后的循环引用
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
            // 将 antd 整棵依赖树（含 rc-*、dayjs、async-validator 等）单独成包，
            // 避免落入泛 vendor 后再反查 react 形成环依赖
            return "vendor-antd";
          },
        },
      },
    },
  };
});
