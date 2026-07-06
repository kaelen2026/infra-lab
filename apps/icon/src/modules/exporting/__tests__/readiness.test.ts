import { describe, expect, it } from "vitest";
import type { IconConfig } from "@/types/icon";
import { defaultIconConfig } from "@/types/icon";
import { getReadinessReport } from "../lib/readiness";

function config(patch: Partial<IconConfig>): IconConfig {
  return { ...defaultIconConfig, ...patch };
}

describe("getReadinessReport", () => {
  it("returns issues when no platform is selected", () => {
    const report = getReadinessReport(defaultIconConfig, []);

    expect(report.status).toBe("issues");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "platform-selection",
          severity: "issue",
        }),
      ]),
    );
  });

  it("returns issues for unknown platforms while reporting known registry entries", () => {
    const report = getReadinessReport(defaultIconConfig, ["ios", "unknown-platform"]);

    expect(report.status).toBe("issues");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "platform-selection",
          severity: "issue",
        }),
        expect.objectContaining({
          id: "registry-export-shape",
          severity: "pass",
          platformIds: ["ios"],
        }),
      ]),
    );
  });

  it("returns warnings without blocking when transform values risk safe zones", () => {
    const report = getReadinessReport(config({ scale: 95, offsetX: 18, rotation: 20 }), [
      "android",
      "webapp",
      "expo",
    ]);

    expect(report.status).toBe("warnings");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "safe-zone-risk",
          severity: "warning",
          platformIds: ["android", "webapp", "expo"],
        }),
      ]),
    );
  });

  it("warns when text is likely unreadable in web favicon sizes", () => {
    const report = getReadinessReport(config({ fgMode: "text", text: "LONGNAME" }), ["web"]);

    expect(report.status).toBe("warnings");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "small-text-legibility",
          severity: "warning",
          platformIds: ["web"],
        }),
      ]),
    );
  });

  it("warns for low contrast text and icon foregrounds", () => {
    const textReport = getReadinessReport(
      config({
        fgMode: "text",
        textColor: "#202020",
        bgColor1: "#1f1f1f",
        bgColor2: "#242424",
        bgType: "solid",
      }),
      ["ios", "web"],
    );

    expect(textReport.status).toBe("warnings");
    expect(textReport.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "contrast-risk",
          severity: "warning",
          platformIds: ["ios", "web"],
        }),
      ]),
    );

    const iconReport = getReadinessReport(
      config({
        fgMode: "icon",
        iconColor: "#202020",
        bgColor1: "#1f1f1f",
        bgColor2: "#242424",
        bgType: "solid",
      }),
      ["android"],
    );

    expect(iconReport.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "contrast-risk" })]),
    );
  });

  it("checks contrast against both gradient colors", () => {
    const report = getReadinessReport(
      config({
        fgMode: "icon",
        iconColor: "#ffffff",
        bgType: "linear",
        bgColor1: "#000000",
        bgColor2: "#ffffff",
      }),
      ["ios"],
    );

    expect(report.status).toBe("warnings");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "contrast-risk",
          severity: "warning",
        }),
      ]),
    );
  });

  it("skips contrast warnings for image and emoji foregrounds", () => {
    const imageReport = getReadinessReport(
      config({
        fgMode: "image",
        bgColor1: "#1f1f1f",
        bgColor2: "#242424",
        bgType: "solid",
      }),
      ["ios"],
    );
    const emojiReport = getReadinessReport(
      config({
        fgMode: "emoji",
        bgColor1: "#1f1f1f",
        bgColor2: "#242424",
        bgType: "solid",
      }),
      ["ios"],
    );

    expect(imageReport.checks.some((check) => check.id === "contrast-risk")).toBe(false);
    expect(emojiReport.checks.some((check) => check.id === "contrast-risk")).toBe(false);
  });

  it("returns ready with pass summaries for a conservative known export", () => {
    const report = getReadinessReport(config({ scale: 56, offsetX: 0, offsetY: 0, rotation: 0 }), [
      "ios",
    ]);

    expect(report.status).toBe("ready");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "platform-selection",
          severity: "pass",
        }),
        expect.objectContaining({
          id: "registry-export-shape",
          severity: "pass",
          platformIds: ["ios"],
        }),
      ]),
    );
  });
});
