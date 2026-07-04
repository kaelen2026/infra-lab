import { LEGAL_DOCS } from "@infra/design";
import type { LegalDocKind } from "@infra/shared";
import { ChevronLeft } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";

/**
 * Public legal document page (`/legal/privacy`, `/legal/terms`). No session gate —
 * anyone can read the隐私协议 / 用户服务协议. h5 is the canonical HOST for these pages;
 * web renders the same `LEGAL_DOCS` source and the native clients open this url in a
 * browser / WebView (see `@infra/shared` `legalUrl`). Content comes straight from
 * `@infra/design`, so the wording never drifts between the surfaces that show it.
 */
export function LegalPage({ kind }: { kind: LegalDocKind }) {
  const doc = LEGAL_DOCS[kind];

  useEffect(() => {
    document.title = `${doc.title} · infra-lab`;
  }, [doc.title]);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center gap-2 px-4">
          <Link
            to="/auth"
            aria-label="返回"
            className="-ml-1 grid size-8 place-items-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <span className="font-serif text-lg font-medium tracking-tight">{doc.title}</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-5 pb-16 pt-6">
        <p className="text-xs text-muted-foreground">生效日期:{doc.effectiveDate}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{doc.intro}</p>

        <div className="mt-8 space-y-7">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-medium">{section.heading}</h2>
              <div className="mt-2 space-y-2">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-relaxed text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
