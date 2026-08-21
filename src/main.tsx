import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/lib/i18n";
import "@/styles/globals.css";
import { StyleGuide } from "@/styleguide/StyleGuide";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <StyleGuide />
  </StrictMode>,
);
