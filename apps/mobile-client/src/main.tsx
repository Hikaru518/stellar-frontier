import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MobileTerminalApp } from "./MobileTerminalApp";
import "./styles.css";

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <StrictMode>
      <MobileTerminalApp />
    </StrictMode>,
  );
}
