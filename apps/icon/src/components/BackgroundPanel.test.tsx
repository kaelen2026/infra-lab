import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import BackgroundPanel from "@/components/BackgroundPanel";
import { presetPatch, stylePresets } from "@/lib/presets";
import { defaultIconConfig } from "@/types/icon";

describe("BackgroundPanel", () => {
  it("applies curated background presets", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const paperPreset = stylePresets.find((preset) => preset.name === "paper");

    if (!paperPreset) throw new Error("paper preset missing");

    render(<BackgroundPanel config={defaultIconConfig} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "paper" }));

    expect(onChange).toHaveBeenCalledWith(presetPatch(paperPreset));
  });

  it("switches background type and edits gradient angle", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<BackgroundPanel config={defaultIconConfig} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "solid" }));
    fireEvent.change(screen.getByRole("slider", { name: /angle/i }), {
      target: { value: "45" },
    });

    expect(onChange).toHaveBeenCalledWith({ bgType: "solid" });
    expect(onChange).toHaveBeenLastCalledWith({ bgAngle: 45 });
  });

  it("disables the second color for solid backgrounds", () => {
    render(
      <BackgroundPanel config={{ ...defaultIconConfig, bgType: "solid" }} onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText("color_2")).toBeDisabled();
  });
});
