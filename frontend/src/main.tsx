/**
 * @fileoverview Application entry point.
 *
 * React 18 concurrent mode root setup. Renders the top-level `<App>` component
 * into the `#root` div defined in `index.html`.
 *
 * `<React.StrictMode>` is enabled which:
 *  - Double-invokes render functions and effects in development to detect side-effects.
 *  - Warns about deprecated lifecycle methods and legacy string refs.
 *  - Has NO effect on production builds.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
