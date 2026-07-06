import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LandingContent from "@/components/LandingContent";

describe("LandingContent", () => {
  it("renders the all-platform landing copy, links, and structured data", () => {
    render(<LandingContent />);

    expect(
      screen.getByRole("heading", {
        name: "Free app icon generator for iOS, Android, web, and favicons",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("EXPORT TARGETS")).toBeInTheDocument();
    expect(screen.getByText("HOW IT WORKS")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Favicon generator" })).toHaveAttribute(
      "href",
      "/favicon-generator",
    );
    expect(document.querySelector('script[type="application/ld+json"]')).toHaveTextContent(
      "WebApplication",
    );
  });
});
