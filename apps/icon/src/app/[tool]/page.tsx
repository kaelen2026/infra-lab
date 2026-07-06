import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StudioLoader from "@/components/StudioLoader";
import ToolLanding from "@/components/ToolLanding";
import { landingPageBySlug, landingPages } from "@/lib/landingPages";

export const dynamicParams = false;

export function generateStaticParams() {
  return landingPages.map((page) => ({ tool: page.slug }));
}

type Props = { params: Promise<{ tool: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tool } = await params;
  const page = landingPageBySlug(tool);
  if (!page) return {};
  return {
    title: { absolute: page.metaTitle },
    description: page.metaDescription,
    alternates: { canonical: `/${page.slug}` },
    openGraph: {
      type: "website",
      url: `/${page.slug}`,
      title: page.metaTitle,
      description: page.metaDescription,
    },
    twitter: {
      card: "summary_large_image",
      title: page.metaTitle,
      description: page.metaDescription,
    },
  };
}

export default async function ToolPage({ params }: Props) {
  const { tool } = await params;
  const page = landingPageBySlug(tool);
  if (!page) notFound();
  return (
    <>
      <StudioLoader initialPlatforms={page.platformIds} />
      <ToolLanding page={page} />
    </>
  );
}
