import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("未找到 #root 挂载点");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
