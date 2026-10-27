import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./ui/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Нет корневого элемента");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
