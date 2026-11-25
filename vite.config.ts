import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, loadEnv } from "vite";
const port = process.env["PORT"] || loadEnv("development", process.cwd(), "")["PORT"] || "3001";
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Icons are imported by many routes. Without this, Rollup emits a
        // separate tiny chunk per icon and the browser pays a round trip for
        // each one — very visible on higher-latency connections.
        manualChunks(id) {
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (
            id.includes("node_modules/recharts") ||
            id.includes("node_modules/d3-") ||
            id.includes("node_modules/victory-vendor")
          )
            return "charts";
          return undefined;
        },
      },
    },
  },
  css: { transformer: "lightningcss" },
  resolve: {
    alias: { "@": `${process.cwd()}/src` },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
    ignoreOutdatedRequests: true,
  },
  server: {
    port: 5174,
    host: "127.0.0.1",
    strictPort: true,
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        "**/data/**",
        "**/work/**",
        "**/.npm-cache/**",
        "**/*.db",
        "**/*.db-*",
        "**/*.sqlite*",
      ],
    },
    watch: { ignored: ["**/data/**", "**/.npm-cache/**", "**/work/**"] },
    proxy: {
      "/api": `http://127.0.0.1:${port}`,
      "/socket.io": { target: `http://127.0.0.1:${port}`, ws: true },
    },
  },
  plugins: [
    tailwindcss(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      server: { entry: "server" },
      spa: { enabled: true, prerender: { outputPath: "/index.html" } },
    }),
    react(),
  ],
});
