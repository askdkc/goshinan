import { createRoot } from "react-dom/client";
import { App } from "./renderer/App";
import "./renderer/styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing application root");
createRoot(root).render(<App />);
