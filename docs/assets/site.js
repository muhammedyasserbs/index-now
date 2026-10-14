// IndexFlow site — small progressive enhancements only.
// After the extension is published, paste its Chrome Web Store listing URL below.
// Every "Add to Chrome" button on the site (data-store-cta) will then point to it.
const STORE_URL = "";

document.querySelectorAll("[data-store-cta]").forEach((link) => {
  if (STORE_URL) {
    link.href = STORE_URL;
    link.target = "_blank";
    link.rel = "noopener";
  }
});

document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});
