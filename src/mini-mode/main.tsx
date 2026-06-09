import "@/index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import MiniApp from "./MiniApp";

const root = createRoot(document.getElementById("root") as HTMLDivElement);
root.render(
    <StrictMode>
        <MiniApp />
    </StrictMode>,
);
