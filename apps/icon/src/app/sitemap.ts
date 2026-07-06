import type { MetadataRoute } from "next";
import { landingPages } from "@/lib/landingPages";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: "monthly",
      priority: 1,
    },
    ...landingPages.map((page) => ({
      url: `${siteUrl}/${page.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
