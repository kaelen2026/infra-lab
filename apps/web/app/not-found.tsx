import Link from "next/link";

import { Button } from "@/components/ui/button";

/** 404 for any unmatched route. Server component — no client state needed. */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-[400px] space-y-4 text-center">
        <p className="font-mono text-sm tracking-[0.18em] text-muted-foreground">404</p>
        <h1 className="font-serif text-2xl font-medium">页面不存在</h1>
        <p className="text-muted-foreground leading-relaxed">你访问的页面不存在或已被移除。</p>
        <Button asChild>
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    </main>
  );
}
