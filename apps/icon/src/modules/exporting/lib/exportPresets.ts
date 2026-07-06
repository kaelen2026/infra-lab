import type { RenderVariant } from "@/lib/renderVariants";
import type { IconConfig } from "@/types/icon";

export type PlatformId = "ios" | "android" | "harmony" | "web" | "webapp" | "expo" | "desktop";

export type PlatformFile = {
  path: string;
  size: number;
  variant: RenderVariant;
};

/** A multi-resolution .ico bundling one render per size. */
export type IcoFile = {
  path: string;
  sizes: number[];
  variant: RenderVariant;
};

export type StaticFile = {
  path: string;
  content: (config: IconConfig) => string;
};

export type Platform = {
  id: PlatformId;
  label: string;
  description: string;
  files: PlatformFile[];
  icoFiles?: IcoFile[];
  staticFiles?: StaticFile[];
  readmeSection: (config: IconConfig) => string;
};

// Android density buckets: [suffix, multiplier of the mdpi base size]
const DENSITIES: [string, number][] = [
  ["mdpi", 1],
  ["hdpi", 1.5],
  ["xhdpi", 2],
  ["xxhdpi", 3],
  ["xxxhdpi", 4],
];

// Apple's iconutil naming: each point size ships a 1x and a @2x pixel render
const macosIconset: PlatformFile[] = [16, 32, 128, 256, 512].flatMap((pt) => [
  {
    path: `desktop/macos/AppIcon.iconset/icon_${pt}x${pt}.png`,
    size: pt,
    variant: "masked" as const,
  },
  {
    path: `desktop/macos/AppIcon.iconset/icon_${pt}x${pt}@2x.png`,
    size: pt * 2,
    variant: "masked" as const,
  },
]);

function androidMipmaps(name: string, baseSize: number, variant: RenderVariant): PlatformFile[] {
  return DENSITIES.map(([suffix, mult]) => ({
    path: `android/res/mipmap-${suffix}/${name}.png`,
    size: Math.round(baseSize * mult),
    variant,
  }));
}

const iosContentsJson = JSON.stringify(
  {
    images: [
      {
        filename: "icon-1024.png",
        idiom: "universal",
        platform: "ios",
        size: "1024x1024",
      },
      {
        appearances: [{ appearance: "luminosity", value: "dark" }],
        filename: "icon-1024-dark.png",
        idiom: "universal",
        platform: "ios",
        size: "1024x1024",
      },
      {
        appearances: [{ appearance: "luminosity", value: "tinted" }],
        filename: "icon-1024-tinted.png",
        idiom: "universal",
        platform: "ios",
        size: "1024x1024",
      },
    ],
    info: { author: "xcode", version: 1 },
  },
  null,
  2,
);

const layeredImageJson = JSON.stringify(
  {
    "layered-image": {
      background: "$media:background",
      foreground: "$media:foreground",
    },
  },
  null,
  2,
);

const icLauncherXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;

function webManifest(config: IconConfig): string {
  const name = config.appName.trim() || "App";
  return JSON.stringify(
    {
      name,
      short_name: name,
      icons: [
        {
          src: "/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/maskable-icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "maskable",
        },
        {
          src: "/maskable-icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    null,
    2,
  );
}

export const platforms: Platform[] = [
  {
    id: "ios",
    label: "iOS",
    description: "Xcode asset catalog + dark/tinted",
    files: [
      {
        path: "ios/AppIcon.appiconset/icon-1024.png",
        size: 1024,
        variant: "fullBleed",
      },
      {
        path: "ios/AppIcon.appiconset/icon-1024-dark.png",
        size: 1024,
        variant: "iosDark",
      },
      {
        path: "ios/AppIcon.appiconset/icon-1024-tinted.png",
        size: 1024,
        variant: "iosTinted",
      },
    ],
    staticFiles: [
      {
        path: "ios/AppIcon.appiconset/Contents.json",
        content: () => iosContentsJson,
      },
    ],
    readmeSection: () => `## iOS

Drag \`ios/AppIcon.appiconset/\` into your Xcode asset catalog (replacing the
existing AppIcon set). The icon is exported full-bleed — iOS applies its own
corner mask. The set includes all three iOS 18 appearances: the standard icon,
a dark variant (transparent background — the system supplies the dark
backdrop), and a tinted variant (grayscale — the system tints it to match the
user's accent color).`,
  },
  {
    id: "android",
    label: "Android",
    description: "Adaptive + legacy launcher icons",
    files: [
      ...androidMipmaps("ic_launcher", 48, "masked"),
      ...androidMipmaps("ic_launcher_foreground", 108, "adaptiveForeground"),
      ...androidMipmaps("ic_launcher_background", 108, "adaptiveBackground"),
      ...androidMipmaps("ic_launcher_monochrome", 108, "monochrome"),
      { path: "android/play-store-icon.png", size: 512, variant: "fullBleed" },
    ],
    staticFiles: [
      {
        path: "android/res/mipmap-anydpi-v26/ic_launcher.xml",
        content: () => icLauncherXml,
      },
    ],
    readmeSection: () => `## Android

Copy the \`android/res/\` folders into your module's \`src/main/res/\`. Android 8+
uses the adaptive layers via \`mipmap-anydpi-v26/ic_launcher.xml\`; older versions
fall back to the legacy \`ic_launcher.png\`. The \`ic_launcher_monochrome\` layer
enables Android 13+ themed icons (the launcher tints its alpha mask); systems
below 13 ignore the \`<monochrome>\` tag. Upload \`play-store-icon.png\`
(512×512, no transparency) in the Play Console.`,
  },
  {
    id: "harmony",
    label: "HarmonyOS",
    description: "Layered icon + AppGallery",
    files: [
      {
        path: "harmony/AppScope/resources/base/media/foreground.png",
        size: 1024,
        variant: "harmonyForeground",
      },
      {
        path: "harmony/AppScope/resources/base/media/background.png",
        size: 1024,
        variant: "adaptiveBackground",
      },
      {
        path: "harmony/start_window_icon.png",
        size: 144,
        variant: "masked",
      },
      {
        path: "harmony/appgallery-icon.png",
        size: 216,
        variant: "fullBleed",
      },
    ],
    staticFiles: [
      {
        path: "harmony/AppScope/resources/base/media/layered_image.json",
        content: () => layeredImageJson,
      },
    ],
    readmeSection: () => `## HarmonyOS

Copy the \`harmony/AppScope/\` tree into your project root (merging with the
existing \`AppScope/\`), then reference the layered icon in \`AppScope/app.json5\`:

\`\`\`json
{ "app": { "icon": "$media:layered_image" } }
\`\`\`

The layers are exported full-bleed with no rounded corners — HarmonyOS applies
its own mask, and the foreground keeps the logo inside the 672px safe zone.
Copy \`start_window_icon.png\` into your entry module's \`media\` folder and set
\`"startWindowIcon"\` in \`module.json5\`. Upload \`appgallery-icon.png\` (216×216,
square corners) in AppGallery Connect.`,
  },
  {
    id: "web",
    label: "Web",
    description: "Favicons + Apple touch icon",
    files: [
      { path: "web/favicon-16x16.png", size: 16, variant: "masked" },
      { path: "web/favicon-32x32.png", size: 32, variant: "masked" },
      { path: "web/apple-touch-icon.png", size: 180, variant: "fullBleed" },
    ],
    icoFiles: [{ path: "web/favicon.ico", sizes: [16, 32, 48], variant: "masked" }],
    readmeSection: () => `## Web

Copy the \`web/\` files into your \`public/\` folder. \`favicon.ico\` (16+32+48)
is picked up automatically from the site root; the \`<link>\` tags cover the
rest:

\`\`\`html
<link rel="icon" sizes="32x32" href="/favicon-32x32.png" />
<link rel="icon" sizes="16x16" href="/favicon-16x16.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
\`\`\``,
  },
  {
    id: "webapp",
    label: "WebApp",
    description: "PWA manifest + maskable icons",
    files: [
      { path: "webapp/icon-192.png", size: 192, variant: "masked" },
      { path: "webapp/icon-512.png", size: 512, variant: "masked" },
      { path: "webapp/maskable-icon-192.png", size: 192, variant: "maskable" },
      { path: "webapp/maskable-icon-512.png", size: 512, variant: "maskable" },
    ],
    staticFiles: [{ path: "webapp/manifest.webmanifest", content: webManifest }],
    readmeSection: () => `## WebApp (PWA)

Copy the \`webapp/\` files into your \`public/\` folder and link the manifest:

\`\`\`html
<link rel="manifest" href="/manifest.webmanifest" />
\`\`\`

Maskable variants keep the foreground inside the 80% safe zone so launchers
can crop to any shape.`,
  },
  {
    id: "expo",
    label: "Expo",
    description: "icon, adaptive-icon, splash",
    files: [
      { path: "expo/icon.png", size: 1024, variant: "masked" },
      {
        path: "expo/adaptive-icon.png",
        size: 1024,
        variant: "adaptiveForeground",
      },
      { path: "expo/splash-icon.png", size: 1024, variant: "masked" },
    ],
    readmeSection: () => `## Expo

Copy the \`expo/\` files into your project's \`assets/\` folder and reference them
in \`app.json\`:

\`\`\`json
{
  "expo": {
    "icon": "./assets/icon.png",
    "splash": { "image": "./assets/splash-icon.png" },
    "android": {
      "adaptiveIcon": { "foregroundImage": "./assets/adaptive-icon.png" }
    }
  }
}
\`\`\``,
  },
  {
    id: "desktop",
    label: "Desktop",
    description: "macOS iconset + Windows ICO",
    files: [...macosIconset, { path: "desktop/icon-1024.png", size: 1024, variant: "masked" }],
    icoFiles: [
      {
        path: "desktop/windows/icon.ico",
        sizes: [16, 24, 32, 48, 64, 128, 256],
        variant: "masked",
      },
    ],
    readmeSection: () => `## Desktop

macOS — convert the iconset into an \`.icns\` (run on macOS):

\`\`\`sh
iconutil -c icns desktop/macos/AppIcon.iconset
\`\`\`

Windows — \`desktop/windows/icon.ico\` bundles 16–256 px PNG entries.

Electron (electron-builder): point \`mac.icon\` at the generated \`.icns\` and
\`win.icon\` at \`icon.ico\`. Tauri: regenerate every target from the master
image with \`npx tauri icon desktop/icon-1024.png\`.`,
  },
];

export const allPlatformIds: PlatformId[] = platforms.map((p) => p.id);

export const extraExportFiles = ["README.md", "icon-config.json"];

/** Every ZIP entry for the given selection, in render/progress order. */
export function exportFileList(selected: PlatformId[]): string[] {
  const paths: string[] = [];
  for (const platform of platforms) {
    if (!selected.includes(platform.id)) continue;
    paths.push(...platform.files.map((f) => f.path));
    paths.push(...(platform.icoFiles ?? []).map((f) => f.path));
    paths.push(...(platform.staticFiles ?? []).map((f) => f.path));
  }
  paths.push(...extraExportFiles);
  return paths;
}

/** Pixel size for a rendered path, or null for static/metadata files. */
export function sizeForPath(path: string): number | null {
  for (const platform of platforms) {
    const file = platform.files.find((f) => f.path === path);
    if (file) return file.size;
  }
  return null;
}
