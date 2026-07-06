import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IconStudio from "@/components/IconStudio";
import type { PlatformId } from "@/modules/exporting/lib/exportPresets";
import { exportZip } from "@/modules/exporting/lib/exportZip";
import type { SavedDesign } from "@/modules/saved-designs";
import { defaultIconConfig, type IconConfig } from "@/types/icon";

type Change = (patch: Partial<IconConfig>) => void;

vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

vi.mock("file-saver", () => ({
  saveAs: vi.fn(),
}));

vi.mock("@/modules/exporting/lib/exportZip", async () => {
  const actual = await vi.importActual<typeof import("@/modules/exporting/lib/exportZip")>(
    "@/modules/exporting/lib/exportZip",
  );
  return {
    ...actual,
    exportZip: vi.fn(async (_config, _selected, onProgress) => {
      onProgress?.("web/favicon-16x16.png");
      return new Blob(["zip"], { type: "application/zip" });
    }),
  };
});

vi.mock("@/lib/presets", async () => {
  const actual = await vi.importActual<typeof import("@/lib/presets")>("@/lib/presets");
  return {
    ...actual,
    randomStylePatch: vi.fn(() => ({ appName: "random-app" })),
  };
});

vi.mock("@/components/VariationPanel", () => ({
  default: ({ config, onApply }: { config: IconConfig; onApply: (config: IconConfig) => void }) => (
    <button type="button" onClick={() => onApply({ ...config, appName: "variant-app" })}>
      apply variation
    </button>
  ),
}));

vi.mock("@/modules/saved-designs", async () => {
  const actual =
    await vi.importActual<typeof import("@/modules/saved-designs")>("@/modules/saved-designs");
  return {
    ...actual,
    SavedDesignsPanel: ({
      designs,
      onDelete,
      onRestore,
      onSave,
    }: {
      designs: SavedDesign[];
      onDelete: (id: string) => void;
      onRestore: (design: SavedDesign) => void;
      onSave: () => void;
    }) => (
      <section>
        <button type="button" onClick={onSave}>
          save design
        </button>
        {designs.map((design) => (
          <div key={design.id}>
            <button type="button" onClick={() => onRestore(design)}>
              restore {design.name}
            </button>
            <button type="button" onClick={() => onDelete(design.id)}>
              delete {design.name}
            </button>
          </div>
        ))}
      </section>
    ),
  };
});

vi.mock("@/components/ForegroundPanel", () => ({
  default: ({ onChange }: { onChange: Change }) => (
    <button type="button" onClick={() => onChange({ fgMode: "text" })}>
      set text mode
    </button>
  ),
}));

vi.mock("@/components/BackgroundPanel", () => ({
  default: ({ onChange }: { onChange: Change }) => (
    <button type="button" onClick={() => onChange({ bgType: "solid" })}>
      set solid bg
    </button>
  ),
}));

vi.mock("@/components/ShapePanel", () => ({
  default: ({ onChange }: { onChange: Change }) => (
    <button type="button" onClick={() => onChange({ shape: "circle" })}>
      set circle shape
    </button>
  ),
}));

vi.mock("@/components/TransformPanel", () => ({
  default: ({ onChange }: { onChange: Change }) => (
    <button type="button" onClick={() => onChange({ scale: 80 })}>
      set scale
    </button>
  ),
}));

vi.mock("@/components/IconPreview", () => ({
  default: ({ config }: { config: IconConfig }) => <div>preview {config.appName}</div>,
}));

vi.mock("@/modules/exporting", async () => {
  const actual = await vi.importActual<typeof import("@/modules/exporting")>("@/modules/exporting");
  return {
    ...actual,
    ExportPanel: ({
      completed,
      exporting,
      onDownload,
      onSelectAll,
      onToggle,
      saved,
      selected,
      zipName,
    }: {
      completed: string[];
      exporting: boolean;
      onDownload: () => void;
      onSelectAll: (all: boolean) => void;
      onToggle: (id: PlatformId) => void;
      saved: boolean;
      selected: PlatformId[];
      zipName: string;
    }) => (
      <section>
        <p>exporting {String(exporting)}</p>
        <p>saved {String(saved)}</p>
        <p>selected {selected.join(",")}</p>
        <p>zip {zipName}</p>
        <p>completed {completed.join(",")}</p>
        <button type="button" onClick={() => onToggle("web")}>
          toggle web
        </button>
        <button type="button" onClick={() => onSelectAll(false)}>
          clear platforms
        </button>
        <button type="button" onClick={() => onSelectAll(true)}>
          all platforms
        </button>
        <button type="button" onClick={onDownload}>
          panel download
        </button>
      </section>
    ),
  };
});

describe("IconStudio", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("coordinates config edits, history, saved designs, import, platforms, and download", async () => {
    const user = userEvent.setup();
    const { container } = render(<IconStudio initialPlatforms={["web"]} />);

    expect(screen.getByText("preview my-app")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "app_name" }), {
      target: { value: "client" },
    });
    expect(screen.getByText("preview client")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "undo" }));
    expect(screen.getByText("preview my-app")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "redo" }));
    expect(screen.getByText("preview client")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "random" }));
    expect(screen.getByText("preview random-app")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "apply variation" }));
    expect(screen.getByText("preview variant-app")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "set text mode" }));
    await user.click(screen.getByRole("button", { name: "set solid bg" }));
    await user.click(screen.getByRole("button", { name: "set circle shape" }));
    await user.click(screen.getByRole("button", { name: "set scale" }));

    await user.click(screen.getByRole("button", { name: "save design" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /restore variant-app/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /delete variant-app/i }));

    await user.click(screen.getByRole("button", { name: "clear platforms" }));
    expect(screen.getByText("selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "all platforms" }));
    expect(screen.getByText(/selected ios,android,harmony/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "toggle web" }));
    expect(screen.getByText(/selected ios,android,harmony/)).toBeInTheDocument();

    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("import input missing");
    }

    fireEvent.change(input, {
      target: {
        files: [
          new File(
            [
              JSON.stringify({
                ...defaultIconConfig,
                appName: "imported",
                fgMode: "image",
                imageSrc: null,
                platforms: ["webapp"],
              }),
            ],
            "icon-config.json",
            { type: "application/json" },
          ),
        ],
      },
    });
    await waitFor(() => {
      expect(screen.getByText("preview imported")).toBeInTheDocument();
    });
    expect(screen.getByText("config imported — re-upload the source image")).toBeInTheDocument();

    fireEvent.change(input, {
      target: {
        files: [new File(["not json"], "bad.json", { type: "application/json" })],
      },
    });
    await waitFor(() => {
      expect(screen.getByText("not a valid icon-config.json")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "panel download" }));

    await waitFor(() => {
      expect(exportZip).toHaveBeenCalled();
      expect(screen.getByText("saved true")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "reset" }));
    expect(screen.getByText("preview my-app")).toBeInTheDocument();
  });

  it("shows an export error when packaging fails", async () => {
    vi.mocked(exportZip).mockRejectedValueOnce(new Error("zip failed"));
    const user = userEvent.setup();

    render(<IconStudio initialPlatforms={["web"]} />);

    await user.click(screen.getByRole("button", { name: "download .zip" }));

    await waitFor(() => {
      expect(screen.getByText("zip failed")).toBeInTheDocument();
    });
  });
});
