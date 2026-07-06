import Link from "next/link";
import type { LandingPage } from "@/lib/landingPages";
import { landingPages } from "@/lib/landingPages";
import { siteName, siteUrl } from "@/lib/site";
import { platforms } from "@/modules/exporting/lib/exportPresets";

// Server-rendered copy for a keyword landing page. The exported-files table
// derives from the exportPresets registry, so it stays truthful and gives
// each page substantially distinct content.

type ExportedFile = { path: string; sizeLabel: string };

function exportedFiles(page: LandingPage): ExportedFile[] {
  const rows: ExportedFile[] = [];
  for (const platform of platforms) {
    if (!page.platformIds.includes(platform.id)) continue;
    for (const file of platform.files) {
      rows.push({
        path: file.path,
        sizeLabel: `${file.size}×${file.size}px`,
      });
    }
    for (const ico of platform.icoFiles ?? []) {
      rows.push({
        path: ico.path,
        sizeLabel: ico.sizes.map((s) => `${s}px`).join(" + "),
      });
    }
    for (const staticFile of platform.staticFiles ?? []) {
      rows.push({ path: staticFile.path, sizeLabel: "config" });
    }
  }
  return rows;
}

export default function ToolLanding({ page }: { page: LandingPage }) {
  const files = exportedFiles(page);
  const siblings = landingPages.filter((p) => p.slug !== page.slug);

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: siteName, item: siteUrl },
          {
            "@type": "ListItem",
            position: 2,
            name: page.navLabel,
            item: `${siteUrl}/${page.slug}`,
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: page.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
    ],
  };

  return (
    <section className="border-t border-hairline px-5 py-16">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static, build-time JSON-LD
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="mx-auto flex max-w-3xl flex-col gap-14">
        <div>
          <h1 className="text-lg text-text">{page.h1}</h1>
          <p className="mt-4 text-[13px] leading-relaxed text-text-dim">{page.intro}</p>
        </div>

        <div>
          <h2 className="text-[11px] tracking-[0.18em] text-text-faint">WHY THIS ONE</h2>
          <dl className="mt-4 grid gap-6 sm:grid-cols-3">
            {page.highlights.map((highlight) => (
              <div key={highlight.title}>
                <dt className="text-[13px] text-text">{highlight.title}</dt>
                <dd className="mt-1 text-[12px] leading-relaxed text-text-dim">
                  {highlight.detail}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h2 className="text-[11px] tracking-[0.18em] text-text-faint">WHAT GETS EXPORTED</h2>
          <table className="mt-4 w-full text-left text-[12px]">
            <thead>
              <tr className="text-text-faint">
                <th className="py-1 pr-4 font-normal">file</th>
                <th className="py-1 font-normal">size</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.path} className="border-t border-hairline">
                  <td className="py-1.5 pr-4 text-text-dim">{file.path}</td>
                  <td className="py-1.5 text-text">{file.sizeLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[12px] leading-relaxed text-text-dim">
            Every export also includes a README with install instructions and an icon-config.json
            you can re-import to keep editing later.
          </p>
        </div>

        <div>
          <h2 className="text-[11px] tracking-[0.18em] text-text-faint">FAQ</h2>
          <dl className="mt-4 flex flex-col gap-5">
            {page.faqs.map((faq) => (
              <div key={faq.question}>
                <dt className="text-[13px] text-text">{faq.question}</dt>
                <dd className="mt-1 text-[12px] leading-relaxed text-text-dim">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h2 className="text-[11px] tracking-[0.18em] text-text-faint">MORE TOOLS</h2>
          <ul className="mt-4 flex flex-col gap-2 text-[13px]">
            <li>
              <Link href="/" className="text-accent hover:underline">
                All-platform app icon generator
              </Link>
            </li>
            {siblings.map((sibling) => (
              <li key={sibling.slug}>
                <Link href={`/${sibling.slug}`} className="text-accent hover:underline">
                  {sibling.navLabel}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
