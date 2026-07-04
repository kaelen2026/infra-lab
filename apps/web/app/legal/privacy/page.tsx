import { LEGAL_DOCS } from "@infra/design";
import type { Metadata } from "next";

import { LegalPage } from "@/features/legal";

export const metadata: Metadata = { title: `${LEGAL_DOCS.privacy.title} · infra-lab` };

// Route entry for /legal/privacy — renders the shared 用户隐私协议 content.
export default function Page() {
  return <LegalPage kind="privacy" />;
}
