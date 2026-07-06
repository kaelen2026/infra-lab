import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ShapePanel from "@/components/ShapePanel";
import { defaultIconConfig } from "@/types/icon";

describe("ShapePanel", () => {
  it("emits a shape patch when users choose a shape", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<ShapePanel config={defaultIconConfig} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "circle" }));

    expect(onChange).toHaveBeenCalledWith({ shape: "circle" });
  });
});
