export const PRODUCT_BRAND = {
  name: "LIEUVA",
  category: "Immersive 3D presentation platform",
  claim: "Give your work a place.",
  description:
    "LIEUVA is a browser-based platform for creating, publishing, sharing and discovering immersive 3D presentations.",
  supportingStatement:
    "Create and publish immersive 3D spaces for art, design and ideas—directly in the browser, with no 3D expertise required.",
  heroCopy:
    "Create and publish immersive 3D spaces for art, design and ideas—directly in the browser, with no 3D expertise required. Start from a template, arrange your work, and share one link people can explore.",
  primaryCta: "Create a Space",
  secondaryCta: "Explore the demo",
  previewLabel: "LIEUVA Early Access",
} as const;

export const productTitle = (title?: string) =>
  title ? `${title} | ${PRODUCT_BRAND.name}` : `${PRODUCT_BRAND.name} — ${PRODUCT_BRAND.category}`;
