import { j as jsxRuntimeExports } from './jsx-runtime-Dz1ZLmT7.js';
import './index-BYMZIHiV.js';

"use strict";
const PAIR_BLUE = "#0062FF";
const PAIR_TEAL = "#00D1FF";
const LIGHT_BG = "#FFFFFF";
const LIGHT_TEXT_MAIN = "#0A0D14";
const LIGHT_TEXT_MUTED = "#4B5563";
const LIGHT_BORDER = "#F1F5F9";
const DARK_BG = "#0A0D14";
const DARK_TEXT_MAIN = "#F8FAFC";
const DARK_TEXT_MUTED = "#94A3B8";
const DARK_BORDER = "#1E293B";

"use strict";
const ANIMATION_STYLES = `
  .pair-logo-animate .pair-pill-blue { transform: translateY(-4px); transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
  .pair-logo-animate .pair-pill-teal { transform: translateY(4px); transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
  .pair-logo-animate:hover .pair-pill-blue { transform: translateY(0); }
  .pair-logo-animate:hover .pair-pill-teal { transform: translateY(0); }
  @media (prefers-reduced-motion: reduce) { .pair-logo-animate .pair-pill-blue, .pair-logo-animate .pair-pill-teal { transform: none; transition: none; } }
`;
const variants = {
  favicon: { viewBox: "0 0 32 32", width: 32, height: 32, showWordmark: false },
  navbar: { viewBox: "0 0 80 24", width: 80, height: 24, showWordmark: true },
  full: { viewBox: "0 0 40 58", width: 40, height: 58, showWordmark: true }
};
function PairLogo({
  variant = "navbar",
  animate = true,
  className = "",
  size
}) {
  const config = variants[variant];
  const containerClass = `pair-logo ${animate ? "pair-logo-animate" : ""} ${className}`.trim();
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { "data-logo-container": true, className: containerClass, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "svg",
    {
      role: "img",
      "aria-label": "pair logo",
      viewBox: config.viewBox,
      width: size || config.width,
      height: size || config.height,
      overflow: "visible",
      xmlns: "http://www.w3.org/2000/svg",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("title", { children: "pair logo" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: ANIMATION_STYLES }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Pills, { variant }),
        config.showWordmark && variant !== "favicon" && /* @__PURE__ */ jsxRuntimeExports.jsx(Wordmark, { variant })
      ]
    }
  ) });
}
function Pills({ variant = "navbar" }) {
  const coords = {
    favicon: {
      blue: { x: 6, y: 8, width: 8, height: 16, rx: 4 },
      teal: { x: 18, y: 8, width: 8, height: 16, rx: 4 }
    },
    navbar: {
      blue: { x: 2, y: 4, width: 6, height: 16, rx: 3 },
      teal: { x: 12, y: 4, width: 6, height: 16, rx: 3 }
    },
    full: {
      blue: { x: 8, y: 2, width: 10, height: 20, rx: 5 },
      teal: { x: 22, y: 2, width: 10, height: 20, rx: 5 }
    }
  };
  const c = coords[variant];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { className: "pair-pills", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { className: "pair-pill-blue", ...c.blue, fill: PAIR_BLUE }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { className: "pair-pill-teal", ...c.teal, fill: PAIR_TEAL })
  ] });
}
function Wordmark({ variant }) {
  const config = variant === "navbar" ? { x: 24, y: 18, fontSize: 14, anchor: void 0 } : { x: 20, y: 48, fontSize: 18, anchor: "middle" };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "text",
    {
      "data-wordmark": true,
      x: config.x,
      y: config.y,
      fontFamily: "var(--font-sans)",
      fontSize: config.fontSize,
      fontWeight: "600",
      fill: "currentColor",
      textAnchor: config.anchor,
      children: "pair"
    }
  );
}

export { PairLogo };
//# sourceMappingURL=Logo-CUgdGdzJ.js.map
