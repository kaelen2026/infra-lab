import Link from "next/link";
import { landingPages } from "@/lib/landingPages";
import { siteDescription, siteName, siteUrl } from "@/lib/site";

// Server-rendered marketing/FAQ copy below the studio. This is the only text
// search engines see without running JS, so it carries the page's SEO weight.

const platforms = [
  {
    name: "iOS & macOS",
    detail:
      "AppIcon.appiconset with Contents.json, ready to drop into an Xcode asset catalog. Full-bleed renders sized for App Store and home screen.",
  },
  {
    name: "Android",
    detail:
      "Adaptive icons with separate foreground and background layers, mipmap XML, and legacy launcher sizes — plus a 512px Play Store icon.",
  },
  {
    name: "Web & PWA",
    detail:
      "Maskable icons, a generated web manifest, and apple-touch-icon sizes that pass Lighthouse PWA checks.",
  },
  {
    name: "Favicon",
    detail:
      "A multi-resolution favicon.ico (16/32/48px) encoded in the browser, alongside PNG favicons for modern browsers.",
  },
];

const steps = [
  {
    title: "Pick a foreground",
    detail:
      "Upload a PNG, SVG, or JPEG; type a letter or word; or choose from the Lucide icon library and recolor it.",
  },
  {
    title: "Style the background and shape",
    detail:
      "Solid colors or gradients, squircle or circle masks, scale and offset — every change renders live on a real canvas.",
  },
  {
    title: "Export a ZIP",
    detail:
      "Select your target platforms and download one ZIP with every required size, native config files, and a README.",
  },
];

const faqs = [
  {
    question: "Are my images uploaded to a server?",
    answer:
      "No. Everything renders locally in your browser with the Canvas API. There is no backend, no upload, and no account — your artwork never leaves your machine.",
  },
  {
    question: "Which platforms can I export icons for?",
    answer:
      "iOS and macOS (Xcode asset catalog), Android (adaptive icon layers and Play Store icon), web and PWA (maskable icons plus manifest), and a multi-resolution favicon.ico.",
  },
  {
    question: "Is the app icon generator free?",
    answer: "Yes. It is completely free, with no sign-up, watermarks, or export limits.",
  },
  {
    question: "Can I edit a design again later?",
    answer:
      "Yes. Your design autosaves in the browser, and every exported ZIP includes an icon-config.json snapshot you can re-import to continue exactly where you left off.",
  },
  {
    question: "What sizes are included in the export?",
    answer:
      "Every size each selected platform requires — from 16px favicons to the 1024px App Store icon — pre-named with the directory layout the platform expects.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: siteName,
      url: siteUrl,
      description: siteDescription,
      applicationCategory: "DesignApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires a modern browser with Canvas support",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
  ],
};

export default function LandingContent() {
  return (
    <section className="border-t border-hairline px-5 py-16">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static, build-time JSON-LD
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="mx-auto flex max-w-3xl flex-col gap-14">
        <div>
          <h1 className="text-lg text-text">
            Free app icon generator for iOS, Android, web, and favicons
          </h1>
          <p className="mt-4 text-[13px] leading-relaxed text-text-dim">
            Design one icon and export every size each platform needs — Xcode asset catalogs,
            Android adaptive layers, PWA maskable icons, and a multi-resolution favicon.ico —
            packaged as a single ZIP. The whole tool runs in your browser: no upload, no sign-up, no
            watermark.
          </p>
        </div>

        <div>
          <h2 className="text-[11px] tracking-[0.18em] text-text-faint">EXPORT TARGETS</h2>
          <dl className="mt-4 grid gap-6 sm:grid-cols-2">
            {platforms.map((platform) => (
              <div key={platform.name}>
                <dt className="text-[13px] text-text">{platform.name}</dt>
                <dd className="mt-1 text-[12px] leading-relaxed text-text-dim">
                  {platform.detail}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h2 className="text-[11px] tracking-[0.18em] text-text-faint">HOW IT WORKS</h2>
          <ol className="mt-4 flex flex-col gap-4">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="text-[12px] text-accent">{index + 1}.</span>
                <div>
                  <h3 className="text-[13px] text-text">{step.title}</h3>
                  <p className="mt-1 text-[12px] leading-relaxed text-text-dim">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h2 className="text-[11px] tracking-[0.18em] text-text-faint">DEDICATED TOOLS</h2>
          <ul className="mt-4 flex flex-col gap-2 text-[13px]">
            {landingPages.map((page) => (
              <li key={page.slug}>
                <Link href={`/${page.slug}`} className="text-accent hover:underline">
                  {page.navLabel}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[11px] tracking-[0.18em] text-text-faint">FAQ</h2>
          <dl className="mt-4 flex flex-col gap-5">
            {faqs.map((faq) => (
              <div key={faq.question}>
                <dt className="text-[13px] text-text">{faq.question}</dt>
                <dd className="mt-1 text-[12px] leading-relaxed text-text-dim">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
