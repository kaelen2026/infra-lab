import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// onnxruntime-web 的 wasm 会被 Vite 当 asset 打进 dist(~21MB),但运行时
// transformers.js 实际从版本匹配的 jsdelivr CDN 拉 wasm(已由浏览器 QA 的网络日志证实),
// 这份本地副本是死重量。构建产物里丢掉它,减小 Pages 部署体积。
function dropOrtWasm(): Plugin {
  return {
    name: "drop-ort-wasm",
    generateBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) {
        if (name.endsWith(".wasm")) delete bundle[name];
      }
    },
  };
}

// base 必须是项目页路径,否则 GitHub Pages 资源 404(见 PLAN.md 决策 5)
export default defineConfig({
  base: "/id-photo-app/",
  plugins: [react(), tailwindcss(), dropOrtWasm()],
  // dev 端口与 monorepo 其它端错开(web:3000 / api:3001 / h5:3002)
  server: { port: 3004 },
  // transformers.js / onnxruntime-web 不要被预打包,交给浏览器按需加载
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
});
