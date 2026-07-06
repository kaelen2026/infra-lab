import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReadinessCheck, ReadinessReport } from "@/modules/exporting";
import { platforms } from "@/modules/exporting";
import ExportPanel from "../components/ExportPanel";

const exportTargetsSelectedCheck = {
  id: "platform-selection",
  severity: "pass",
  title: "Export targets selected",
  detail: "All selected platforms are available in the export registry.",
  platformIds: ["web"],
} satisfies ReadinessCheck;

const exportFilesRegisteredCheck = {
  id: "registry-export-shape",
  severity: "pass",
  title: "Export files are registered",
  detail: "The export registry has output files for the selected platforms.",
  platformIds: ["web"],
} satisfies ReadinessCheck;

const readyReport = {
  status: "ready",
  checks: [exportTargetsSelectedCheck, exportFilesRegisteredCheck],
} satisfies ReadinessReport;

const warningReport = {
  status: "warnings",
  checks: [
    exportTargetsSelectedCheck,
    {
      id: "small-text-legibility",
      severity: "warning",
      title: "Text may be unreadable at favicon sizes",
      detail: "Shorten text to three characters or fewer for tiny web favicon exports.",
      platformIds: ["web"],
    },
    exportFilesRegisteredCheck,
  ],
} satisfies ReadinessReport;

const issueReport = {
  status: "issues",
  checks: [
    {
      id: "platform-selection",
      severity: "issue",
      title: "Select at least one export target",
      detail: "Choose a platform before exporting the icon package.",
    },
  ],
} satisfies ReadinessReport;

const baseProps = {
  exporting: false,
  completed: [],
  readiness: readyReport,
  saved: false,
  selected: ["web" as const],
  zipName: "my-app-icons.zip",
  onToggle: vi.fn(),
  onSelectAll: vi.fn(),
  onDownload: vi.fn(),
};

describe("ExportPanel", () => {
  it("toggles platforms and starts a download", async () => {
    const onToggle = vi.fn();
    const onDownload = vi.fn();
    const user = userEvent.setup();

    render(<ExportPanel {...baseProps} onToggle={onToggle} onDownload={onDownload} />);

    await user.click(screen.getByRole("checkbox", { name: /iOS/i }));
    await user.click(screen.getByRole("button", { name: "download .zip" }));

    expect(onToggle).toHaveBeenCalledWith("ios");
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("shows empty and saved states", () => {
    const { rerender } = render(
      <ExportPanel {...baseProps} selected={[]} zipName="empty-icons.zip" />,
    );

    expect(screen.getByText("no platforms selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "download .zip" })).toBeDisabled();

    rerender(<ExportPanel {...baseProps} saved zipName="client-icons.zip" />);

    expect(screen.getByText("client-icons.zip ✓ saved")).toBeInTheDocument();
  });

  it("selects or clears every platform from the select-all control", async () => {
    const onSelectAll = vi.fn();
    const user = userEvent.setup();
    const allPlatformIds = platforms.map((platform) => platform.id);

    const { rerender } = render(
      <ExportPanel {...baseProps} selected={[]} onSelectAll={onSelectAll} />,
    );

    await user.click(screen.getByRole("button", { name: "select all" }));

    expect(onSelectAll).toHaveBeenCalledWith(true);

    rerender(<ExportPanel {...baseProps} selected={allPlatformIds} onSelectAll={onSelectAll} />);

    await user.click(screen.getByRole("button", { name: "clear all" }));

    expect(onSelectAll).toHaveBeenCalledWith(false);
  });

  it("renders warning readiness without disabling download", async () => {
    const onDownload = vi.fn();
    const user = userEvent.setup();

    render(<ExportPanel {...baseProps} onDownload={onDownload} readiness={warningReport} />);

    expect(screen.getByText("readiness")).toBeInTheDocument();
    expect(screen.getByText("warnings · 1 item needs review")).toBeInTheDocument();
    expect(screen.getByText("Text may be unreadable at favicon sizes")).toBeInTheDocument();
    expect(screen.getByText("web")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "download .zip" }));

    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("renders issue readiness while empty platform selection disables download", () => {
    render(<ExportPanel {...baseProps} readiness={issueReport} selected={[]} />);

    expect(screen.getByText("issues · 1 item needs review")).toBeInTheDocument();
    expect(screen.getByText("Select at least one export target")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "download .zip" })).toBeDisabled();
  });
});
