import { j as jsxRuntimeExports } from './jsx-runtime-Dz1ZLmT7.js';
import './index-BYMZIHiV.js';

"use strict";
function Card({ children, className = "", glass = false }) {
  const baseClass = "pair-card rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm";
  const glassClass = glass ? "glass-effect" : "";
  const combinedClass = `${baseClass} ${glassClass} ${className}`.trim();
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: combinedClass, children });
}

export { Card };
//# sourceMappingURL=Card-CCAW15wH.js.map
