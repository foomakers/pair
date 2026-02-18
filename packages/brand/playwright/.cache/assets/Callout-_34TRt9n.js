import { j as jsxRuntimeExports } from './jsx-runtime-Dz1ZLmT7.js';
import './index-BYMZIHiV.js';

"use strict";
function Callout({ type = "info", title, children, className = "" }) {
  const baseClass = "pair-callout rounded-lg p-4 border-l-4";
  const typeClasses = {
    info: "bg-blue-50 dark:bg-blue-950 border-pair-blue",
    warning: "bg-amber-50 dark:bg-amber-950 border-amber-500",
    tip: "bg-teal-50 dark:bg-teal-950 border-pair-teal"
  };
  const combinedClass = `${baseClass} ${type} ${typeClasses[type]} ${className}`.trim();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: combinedClass, children: [
    title && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-semibold mb-2", children: title }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children })
  ] });
}

export { Callout };
//# sourceMappingURL=Callout-_34TRt9n.js.map
