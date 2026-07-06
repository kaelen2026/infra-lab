import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ForegroundPanel from "@/components/ForegroundPanel";
import { defaultIconConfig } from "@/types/icon";

describe("ForegroundPanel", () => {
  it("switches foreground modes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<ForegroundPanel config={defaultIconConfig} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "text" }));

    expect(onChange).toHaveBeenCalledWith({ fgMode: "text" });
  });

  it("edits text foreground settings", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ForegroundPanel config={{ ...defaultIconConfig, fgMode: "text" }} onChange={onChange} />,
    );

    await user.clear(screen.getByRole("textbox", { name: "text foreground" }));
    await user.type(screen.getByRole("textbox", { name: "text foreground" }), "Hi");
    await user.click(screen.getByRole("button", { name: "serif" }));

    expect(onChange).toHaveBeenCalledWith({ text: "" });
    expect(onChange).toHaveBeenLastCalledWith({ textFont: "serif" });
  });

  it("filters icon choices and updates icon settings", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<ForegroundPanel config={defaultIconConfig} onChange={onChange} />);

    await user.type(screen.getByRole("textbox", { name: "search icons" }), "heart");
    await user.click(screen.getByRole("button", { name: "heart" }));
    fireEvent.change(screen.getByLabelText("icon color"), {
      target: { value: "#ffffff" },
    });
    fireEvent.change(screen.getByRole("slider", { name: /stroke/i }), {
      target: { value: "3" },
    });

    expect(onChange).toHaveBeenCalledWith({ iconName: "Heart" });
    expect(onChange).toHaveBeenLastCalledWith({ iconStroke: 3 });
  });

  it("edits emoji foreground settings", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ForegroundPanel config={{ ...defaultIconConfig, fgMode: "emoji" }} onChange={onChange} />,
    );

    await user.click(screen.getByRole("button", { name: "⚡" }));
    fireEvent.change(screen.getByRole("textbox", { name: "emoji foreground" }), {
      target: { value: "🎨" },
    });

    expect(onChange).toHaveBeenCalledWith({ emoji: "⚡" });
    expect(onChange).toHaveBeenLastCalledWith({ emoji: "🎨" });
  });
});
