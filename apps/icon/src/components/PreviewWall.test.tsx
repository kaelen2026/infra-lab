import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PreviewWall from "@/components/PreviewWall";
import { defaultIconConfig } from "@/types/icon";

vi.mock("@/lib/renderIcon", () => ({
  renderIconDataUrl: vi.fn(
    async (_config, _size, variant = "masked") => `data:image/png;base64,${variant}`,
  ),
}));

describe("PreviewWall", () => {
  it("renders platform previews for the app name", async () => {
    render(<PreviewWall config={{ ...defaultIconConfig, appName: "Client App" }} />);

    expect(screen.getAllByText("Client App")).toHaveLength(5);
    expect(screen.getByText("ios")).toBeInTheDocument();
    expect(screen.getByText("android")).toBeInTheDocument();
    expect(screen.getByText("harmony")).toBeInTheDocument();
    expect(screen.getByText("tab")).toBeInTheDocument();
    expect(screen.getByText("pwa")).toBeInTheDocument();

    await waitFor(() => {
      expect(document.querySelectorAll("img").length).toBeGreaterThanOrEqual(5);
    });
  });

  it("uses a fallback preview name for blank app names", () => {
    render(<PreviewWall config={{ ...defaultIconConfig, appName: "  " }} />);

    expect(screen.getAllByText("my-app")).toHaveLength(5);
  });
});
