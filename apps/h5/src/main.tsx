import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "@/App";
import { applyTheme, getInitialTheme } from "@/lib/theme";
import "@/index.css";

// Resolve the persisted theme before first paint so there's no light/dark flash.
applyTheme(getInitialTheme());

const root = document.getElementById("root");
if (!root) throw new Error("#root element is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
