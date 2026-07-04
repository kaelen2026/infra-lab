import { LEGAL_DOCS } from "@infra/design";
import type { LegalDocKind } from "@infra/shared";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

/**
 * Renders a legal document (隐私协议 / 用户服务协议). h5 is the canonical HOST for these
 * pages; web REFERENCES the exact same `LEGAL_DOCS` source from `@infra/design`, so the
 * two surfaces can never drift. Static content — no client state, so this stays a
 * server component.
 */
export function LegalPage({ kind }: { kind: LegalDocKind }) {
  const doc = LEGAL_DOCS[kind];

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <Link
        href="/auth"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ChevronLeft className="size-4" />
        返回登录
      </Link>

      <h1 className="mt-6 font-serif text-3xl font-medium">{doc.title}</h1>
      <p className="mt-2 text-xs text-muted-foreground">生效日期:{doc.effectiveDate}</p>
      <p className="mt-4 leading-relaxed text-muted-foreground">{doc.intro}</p>

      <div className="mt-10 space-y-8">
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-medium">{section.heading}</h2>
            <div className="mt-2 space-y-2">
              {section.body.map((paragraph) => (
                <p key={paragraph} className="leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
