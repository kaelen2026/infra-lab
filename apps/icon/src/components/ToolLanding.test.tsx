import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ToolLanding from "@/components/ToolLanding";
import { landingPages } from "@/lib/landingPages";

describe("ToolLanding", () => {
  it("renders page-specific copy and exported file rows", () => {
    const page = landingPages.find((item) => item.slug === "favicon-generator");

    if (!page) throw new Error("favicon landing page missing");

    render(<ToolLanding page={page} />);

    expect(screen.getByRole("heading", { name: page.h1 })).toBeInTheDocument();
    expect(screen.getByText("WHAT GETS EXPORTED")).toBeInTheDocument();
    expect(screen.getByText("web/favicon-16x16.png")).toBeInTheDocument();
    expect(screen.getByText("16×16px")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All-platform app icon generator" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(document.querySelector('script[type="application/ld+json"]')).toHaveTextContent(
      "BreadcrumbList",
    );
  });
});
