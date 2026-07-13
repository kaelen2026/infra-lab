import { COPY } from "@infra/design";
import { LEGAL_ROUTES } from "@infra/shared";
import { KeyRound, ListTodo, Newspaper, QrCode } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const { brand } = COPY;
const { hero, features, platforms, footer } = COPY.landing;

interface Feature {
  icon: ReactNode;
  title: string;
  body: string;
}

const FEATURES: readonly Feature[] = [
  { icon: <KeyRound aria-hidden />, title: features.auth.title, body: features.auth.body },
  {
    icon: <Newspaper aria-hidden />,
    title: features.timeline.title,
    body: features.timeline.body,
  },
  {
    icon: <QrCode aria-hidden />,
    title: features.crossDevice.title,
    body: features.crossDevice.body,
  },
  { icon: <ListTodo aria-hidden />, title: features.todo.title, body: features.todo.body },
];

/** Brand wordmark: the primary dot + serif name shared with the auth screen / nav. */
function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="size-2 rounded-full bg-primary" aria-hidden />
      <span className="font-serif text-lg font-medium tracking-tight">{brand}</span>
    </span>
  );
}

/**
 * Public marketing landing — the default `/` shown to signed-out visitors (the
 * signed-in branch renders the dashboard instead; see `features/home`). No session
 * dependency and no auth guard: it is a purely presentational page, mirroring the
 * legal pages. All copy comes from `@infra/design`'s web-only `COPY.landing`.
 */
export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Brand />
        <div className="flex items-center gap-2">
          <ModeToggle />
          <Button asChild size="sm">
            <Link href="/auth">{hero.primaryCta}</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="py-20 text-center sm:py-28">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {hero.eyebrow}
          </p>
          <h1 className="mx-auto mt-5 max-w-2xl text-balance font-serif text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
            {hero.title}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {hero.subtitle}
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/auth">{hero.primaryCta}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/auth/qr">
                <QrCode aria-hidden />
                {hero.secondaryCta}
              </Link>
            </Button>
          </div>
        </section>

        <section aria-labelledby="features-heading" className="pb-16">
          <h2 id="features-heading" className="sr-only">
            {features.heading}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <span className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">
                    {feature.icon}
                  </span>
                  <CardTitle className="font-serif text-lg font-medium">{feature.title}</CardTitle>
                  <CardDescription className="leading-relaxed">{feature.body}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="platforms-heading" className="pb-24 text-center">
          <h2
            id="platforms-heading"
            className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
          >
            {platforms.heading}
          </h2>
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {platforms.items.map((platform) => (
              <li
                key={platform}
                className="rounded-full border border-border px-3.5 py-1.5 text-sm text-foreground/80"
              >
                {platform}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>
            {brand} · {footer.tagline}
          </span>
          <nav className="flex items-center gap-5">
            <Link href={LEGAL_ROUTES.terms} className="hover:text-foreground">
              {COPY.legal.termsLabel}
            </Link>
            <Link href={LEGAL_ROUTES.privacy} className="hover:text-foreground">
              {COPY.legal.privacyLabel}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
