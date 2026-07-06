import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { defaultIconConfig } from "@/types/icon";
import SavedDesignsPanel from "../components/SavedDesignsPanel";
import type { SavedDesign } from "../lib/savedDesigns";

const savedDesign: SavedDesign = {
  id: "design-1",
  name: "client-app",
  createdAt: Date.UTC(2026, 5, 12, 12, 0),
  config: defaultIconConfig,
};

describe("SavedDesignsPanel", () => {
  it("shows an empty state and lets users save the current design", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(
      <SavedDesignsPanel designs={[]} onSave={onSave} onRestore={vi.fn()} onDelete={vi.fn()} />,
    );

    expect(screen.getByText("no saved designs yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "save current" }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("restores and deletes saved designs from the list", async () => {
    const onRestore = vi.fn();
    const onDelete = vi.fn();
    const user = userEvent.setup();

    render(
      <SavedDesignsPanel
        designs={[savedDesign]}
        onSave={vi.fn()}
        onRestore={onRestore}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole("button", { name: "restore client-app" }));
    await user.click(screen.getByRole("button", { name: "delete client-app" }));

    expect(onRestore).toHaveBeenCalledWith(savedDesign);
    expect(onDelete).toHaveBeenCalledWith("design-1");
  });
});
