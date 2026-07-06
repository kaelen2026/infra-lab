import type { PlatformId } from "@/modules/exporting/lib/exportPresets";

// Keyword landing pages. Each renders the same studio with that platform
// preselected plus page-specific server copy — sizes tables derive from
// exportPresets so every page stays truthful and distinct.
export type LandingPage = {
  slug: string;
  navLabel: string;
  platformIds: PlatformId[];
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  highlights: { title: string; detail: string }[];
  faqs: { question: string; answer: string }[];
};

export const landingPages: LandingPage[] = [
  {
    slug: "favicon-generator",
    navLabel: "Favicon generator",
    platformIds: ["web"],
    metaTitle: "Favicon Generator — Free favicon.ico Maker, No Upload",
    metaDescription:
      "Free favicon generator that runs entirely in your browser. Create a multi-resolution favicon.ico (16/32/48px), PNG favicons, and an apple-touch-icon from an image, text, or symbol — no upload, no sign-up.",
    h1: "Free favicon generator — favicon.ico and PNG, made in your browser",
    intro:
      "Design a favicon from an uploaded image, a letter, or a symbol, and download a ready-to-use pack: a multi-resolution favicon.ico encoded right in your browser, crisp 16×16 and 32×32 PNGs, and a 180×180 apple-touch-icon. Your artwork never leaves your machine.",
    highlights: [
      {
        title: "Real .ico encoding",
        detail:
          "The favicon.ico bundles 16, 32, and 48px renders in one file, encoded client-side — the format browsers have understood since forever.",
      },
      {
        title: "Sharp at tiny sizes",
        detail:
          "Each size is rendered from vectors and canvas at its exact pixel grid, not downscaled from one big image, so 16px stays legible.",
      },
      {
        title: "Copy-paste install",
        detail:
          "The export README includes the exact <link> tags for your <head> — drop the files in /public and paste two lines.",
      },
    ],
    faqs: [
      {
        question: "What sizes does a favicon need in 2026?",
        answer:
          "A multi-resolution favicon.ico with 16, 32, and 48px entries covers legacy browsers and Windows, while 16×16 and 32×32 PNGs serve modern tabs and a 180×180 apple-touch-icon covers iOS home screens. This generator exports all of them at once.",
      },
      {
        question: "Should I use .ico or .png for my favicon?",
        answer:
          "Both: favicon.ico at the site root is still the most universally supported, and PNG <link> tags give modern browsers sharper renders. The exported pack includes the two PNG sizes plus the .ico.",
      },
      {
        question: "Is my logo uploaded anywhere?",
        answer:
          "No. Rendering and .ico encoding happen locally in your browser with the Canvas API — there is no server, no upload, and no account.",
      },
      {
        question: "How do I add the favicon to my site?",
        answer:
          "Copy the exported web/ files into your public folder. favicon.ico is picked up automatically from the site root; the included README shows the <link> tags for the PNG and apple-touch-icon variants.",
      },
    ],
  },
  {
    slug: "ios-app-icon-generator",
    navLabel: "iOS icon generator",
    platformIds: ["ios"],
    metaTitle: "iOS App Icon Generator — Xcode Catalog with Dark & Tinted",
    metaDescription:
      "Generate an iOS app icon in your browser: a ready-to-drop AppIcon.appiconset with all three iOS 18 appearances — standard, dark, and tinted — plus Contents.json for Xcode. Free, no upload, no sign-up.",
    h1: "iOS app icon generator — Xcode-ready, with dark and tinted variants",
    intro:
      "Design once and download an AppIcon.appiconset you can drag straight into Xcode: a 1024×1024 full-bleed PNG plus the dark and tinted variants iOS 18 home screens use, wired together by the Contents.json that modern single-size catalogs expect. iOS applies its own corner mask, and the preview shows you exactly how the squircle crop will land.",
    highlights: [
      {
        title: "Single-size catalog",
        detail:
          "Since Xcode 14, one 1024px icon covers every device — the exported Contents.json uses the modern single-size format, no 20-file grid.",
      },
      {
        title: "Full-bleed, square corners",
        detail:
          "Apple rejects pre-rounded icons. The export ships square; the in-app preview simulates the iOS mask so there are no surprises.",
      },
      {
        title: "App Store ready",
        detail:
          "1024×1024 with no alpha-channel surprises is exactly what App Store Connect validates against.",
      },
    ],
    faqs: [
      {
        question: "What size does an iOS app icon need to be?",
        answer:
          "1024×1024 pixels. Since Xcode 14, asset catalogs support a single-size icon and generate every device variant from it — which is exactly what this tool exports.",
      },
      {
        question: "Should my iOS icon have rounded corners?",
        answer:
          "No. Export it as a full square — iOS applies the superellipse (squircle) mask itself, and pre-rounded corners can cause App Store rejection. The live preview here shows the masked result while the file stays full-bleed.",
      },
      {
        question: "How do I import the icon into Xcode?",
        answer:
          "Unzip the export and drag the ios/AppIcon.appiconset folder into your asset catalog, replacing the existing AppIcon set. Contents.json is included, so Xcode recognizes it immediately.",
      },
      {
        question: "What are iOS 18 dark and tinted icons?",
        answer:
          "Since iOS 18, users can switch their home screen to dark or tinted icon styles. The export includes a dark variant (your foreground on a transparent background — the system supplies the dark backdrop) and a tinted variant (grayscale, which the system tints to the user's accent color), declared in Contents.json so Xcode picks them up automatically.",
      },
      {
        question: "Does this work for macOS or watchOS icons too?",
        answer:
          "The iOS export targets iPhone and iPad. For macOS there is a separate Desktop export with a full AppIcon.iconset, selectable in the same studio.",
      },
    ],
  },
  {
    slug: "android-icon-generator",
    navLabel: "Android icon generator",
    platformIds: ["android"],
    metaTitle: "Android Adaptive Icon Generator — Free Launcher Icon Maker",
    metaDescription:
      "Create Android adaptive icons in your browser: separate foreground, background, and monochrome layers across all five densities, legacy launcher icons, and a 512px Play Store icon. Free, no upload.",
    h1: "Android adaptive icon generator — every density, every layer",
    intro:
      "One design exports the complete Android launcher set: adaptive foreground, background, and monochrome layers from mdpi to xxxhdpi, the mipmap-anydpi-v26 XML that wires them together, legacy ic_launcher fallbacks for Android 7 and below, and the 512×512 Play Store icon.",
    highlights: [
      {
        title: "True adaptive layers",
        detail:
          "Foreground and background export as separate 108dp layers with your composition held inside the 66dp safe zone, so launcher shapes and parallax effects never clip it.",
      },
      {
        title: "Themed icons included",
        detail:
          "The monochrome layer enables Android 13+ Material You themed icons; older versions simply ignore the <monochrome> tag.",
      },
      {
        title: "All five densities",
        detail:
          "Every layer renders at mdpi, hdpi, xhdpi, xxhdpi, and xxxhdpi at the exact pixel sizes Android expects — 20 launcher files plus the Play Store icon.",
      },
    ],
    faqs: [
      {
        question: "What is an Android adaptive icon?",
        answer:
          "Since Android 8, launcher icons are two layers — a background and a foreground — that the launcher masks into its own shape (circle, squircle, rounded square) and can animate independently. This generator exports both layers plus the XML that declares them.",
      },
      {
        question: "What is the adaptive icon safe zone?",
        answer:
          "Adaptive layers are 108dp, but launchers may crop to a 66dp circle. The export automatically scales your composition into that safe zone, so nothing important gets cut off regardless of the device's mask shape.",
      },
      {
        question: "What are Android themed icons and do I need them?",
        answer:
          "Android 13 introduced Material You themed icons, which tint a monochrome version of your icon to match the user's wallpaper. The export includes the monochrome layer, so your app supports theming with zero extra work.",
      },
      {
        question: "What does the Play Store require for the app icon?",
        answer:
          "A 512×512 PNG with no transparency, uploaded in the Play Console. It is included in the export as play-store-icon.png, rendered full-bleed since Google Play applies its own rounding.",
      },
    ],
  },
  {
    slug: "pwa-icon-generator",
    navLabel: "PWA icon generator",
    platformIds: ["webapp"],
    metaTitle: "PWA Icon Generator — Free Maskable Icons + Web Manifest",
    metaDescription:
      "Generate PWA icons in your browser: 192px and 512px icons in both any and maskable variants, plus a ready web manifest. Passes Lighthouse installability checks. Free, no upload.",
    h1: "PWA icon generator — maskable icons and a ready manifest",
    intro:
      "Export everything a progressive web app needs to be installable: 192×192 and 512×512 icons in both standard and maskable variants, plus a manifest.webmanifest that references them with the right purpose values. Maskable renders keep your composition inside the 80% safe zone so any launcher crop looks intentional.",
    highlights: [
      {
        title: "Maskable done right",
        detail:
          "Maskable variants scale the composition into the W3C 80% safe zone, so circular and squircle crops on Android never clip your logo.",
      },
      {
        title: "Manifest included",
        detail:
          "The export ships a manifest.webmanifest with all four icons declared — any and maskable purposes at both sizes — ready to link from your <head>.",
      },
      {
        title: "Lighthouse green",
        detail:
          "192px and 512px icons with a valid manifest are exactly what Lighthouse and Chrome's installability criteria check for.",
      },
    ],
    faqs: [
      {
        question: "What is a maskable icon?",
        answer:
          "A maskable icon declares (via purpose: 'maskable') that it fills its entire canvas and tolerates being cropped to any shape. Launchers crop up to the 80% safe zone — this generator keeps your design inside it automatically.",
      },
      {
        question: "What icon sizes does a PWA need?",
        answer:
          "192×192 and 512×512 are the two sizes Chrome requires for installability; the 512px version is also used for the install splash screen. The export includes both, in standard and maskable variants.",
      },
      {
        question: "How do I wire the icons into my app?",
        answer:
          'Copy the webapp/ files into your public folder and add <link rel="manifest" href="/manifest.webmanifest"> to your <head>. The manifest already references all four icon files with correct sizes and purposes.',
      },
      {
        question: "Why are there separate 'any' and 'maskable' versions?",
        answer:
          "Declaring one image as both lets platforms over-crop the standard render. Shipping separate files — a normal render for purpose 'any' and a safe-zone render for 'maskable' — is the spec-recommended approach, and it is what this export does.",
      },
    ],
  },
];

export function landingPageBySlug(slug: string): LandingPage | undefined {
  return landingPages.find((page) => page.slug === slug);
}
