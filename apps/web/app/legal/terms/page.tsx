import { LEGAL_DOCS } from "@infra/design";
import type { Metadata } from "next";

import { LegalPage } from "@/features/legal";

export const metadata: Metadata = { title: `${LEGAL_DOCS.terms.title} · infra-lab` };

// Route entry for /legal/terms — renders the shared 用户服务协议 content.
export default function Page() {
  return <LegalPage kind="terms" />;
}
