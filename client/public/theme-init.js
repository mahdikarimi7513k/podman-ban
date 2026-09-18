// Apply the persisted theme before first paint to avoid a flash.
// Key matches next-themes' default storageKey ("theme").
// External file (never inline) so the document CSP can keep
// script-src 'self' with no 'unsafe-inline'.
try {
  var t = localStorage.getItem("theme") || "light";
  if (t === "system") {
    t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  if (t === "dark") document.documentElement.classList.add("dark");
} catch (e) {}
