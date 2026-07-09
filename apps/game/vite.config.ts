import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 单机斗地主:页面外壳(状态栏/按钮/弹窗)用 React + Tailwind,棋盘用 <canvas>
// 命令式渲染以保证帧率。无后端、无 auth 依赖,只是把 TS 引擎 + 渲染打成静态站点。
// base 设为项目页路径,便于像 id-photo 一样部署到 GitHub Pages 子路径。
// dev 端口与 monorepo 其它端错开(web:3000 / api:3001 / h5:3002 / icon:3003 / id-photo:3004)。
export default defineConfig({
  base: "/game/",
  plugins: [react(), tailwindcss()],
  server: { port: 3005 },
});
