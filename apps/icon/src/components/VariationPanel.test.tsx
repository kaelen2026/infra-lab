import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import VariationPanel from "@/components/VariationPanel";
import { defaultIconConfig } from "@/types/icon";

vi.mock("@/lib/renderIcon", () => ({
  renderIconDataUrl: vi.fn(async () => "data:image/png;base64,thumb"),
}));

describe("VariationPanel", () => {
  it("renders generated variation thumbnails and applies a variation", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();

    render(<VariationPanel config={defaultIconConfig} onApply={onApply} />);

    await waitFor(() => {
      expect(document.querySelectorAll("img")).toHaveLength(6);
    });
    await user.click(screen.getByRole("button", { name: "calm" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ appName: defaultIconConfig.appName }),
    );
  });
});
