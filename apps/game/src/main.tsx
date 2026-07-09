import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BackgroundMusic } from "./audio/music.js";
import { GameController } from "./game/controller.js";
import { App } from "./ui/App.js";
import "./index.css";

const controller = new GameController();
const music = new BackgroundMusic();
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App controller={controller} music={music} />
    </StrictMode>,
  );
}
