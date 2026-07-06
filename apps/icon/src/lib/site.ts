// Canonical site identity shared by metadata, robots, sitemap, manifest, and
// JSON-LD. NEXT_PUBLIC_SITE_URL overrides the domain per environment.
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://icon.w3ctech.dev";

export const siteName = "App Icon Generator";

export const siteTitle = "App Icon Generator — Free iOS, Android & Favicon Maker";

export const siteDescription =
  "Free app icon generator that runs entirely in your browser. Design an icon from an image, text, or symbol and export iOS, Android adaptive, PWA, and favicon packs as one ZIP — no upload, no sign-up.";
