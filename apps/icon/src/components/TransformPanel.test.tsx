import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TransformPanel from "@/components/TransformPanel";
import { defaultIconConfig } from "@/types/icon";

describe("TransformPanel", () => {
  it("updates numeric transform sliders", async () => {
    const onChange = vi.fn();

    render(<TransformPanel config={defaultIconConfig} onChange={onChange} />);

    fireEvent.change(screen.getByRole("slider", { name: /scale/i }), {
      target: { value: "80" },
    });

    expect(onChange).toHaveBeenLastCalledWith({ scale: 80 });
  });

  it("resets transform controls to defaults", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <TransformPanel
        config={{ ...defaultIconConfig, scale: 90, offsetX: 20, rotation: 30 }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "reset" }));

    expect(onChange).toHaveBeenCalledWith({
      scale: defaultIconConfig.scale,
      offsetX: defaultIconConfig.offsetX,
      offsetY: defaultIconConfig.offsetY,
      rotation: defaultIconConfig.rotation,
    });
  });
});
