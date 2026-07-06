import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import IconPreview from "@/components/IconPreview";
import { drawIcon } from "@/lib/renderIcon";
import { defaultIconConfig } from "@/types/icon";

vi.mock("@/lib/renderIcon", () => ({
  drawIcon: vi.fn(async () => undefined),
  renderIconDataUrl: vi.fn(async () => "data:image/png;base64,preview"),
}));

describe("IconPreview", () => {
  beforeEach(() => {
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
  });

  it("draws the live preview canvas and renders the preview wall", async () => {
    render(<IconPreview config={defaultIconConfig} />);

    expect(screen.getByText("1024 × 1024 · live render")).toBeInTheDocument();
    await waitFor(() => {
      expect(drawIcon).toHaveBeenCalledWith(expect.anything(), defaultIconConfig, 1024);
    });
    await waitFor(() => {
      expect(document.querySelectorAll("img").length).toBeGreaterThanOrEqual(5);
    });
  });
});
