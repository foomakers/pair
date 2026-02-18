import { j as jsxRuntimeExports } from './jsx-runtime-C0mGjcXq.js';
import './index-uLnGPXay.js';

"use strict";
function Link({
  href,
  children,
  className
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href, className, children });
}

"use strict";
const metadata = {
  title: "pair — Code is the easy part.",
  description: "pair enables seamless dev-AI collaboration for any engineering team way of working."
};
function HomePage() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("main", { className: "flex min-h-screen flex-col items-center justify-center bg-pair-bg-light dark:bg-pair-bg-dark", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-5xl font-bold font-sans text-pair-text-light dark:text-pair-text-dark", children: "pair" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-4 text-xl text-pair-text-muted-light dark:text-pair-text-muted-dark", children: "Code is the easy part." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-8 flex gap-4 justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      Link,
      {
        href: "/docs",
        className: "rounded-pair bg-pair-blue px-6 py-3 font-semibold text-white transition-all hover:opacity-90",
        children: "Documentation"
      }
    ) })
  ] }) });
}

export { HomePage as default, metadata };
//# sourceMappingURL=page-D0TAxnmv.js.map
