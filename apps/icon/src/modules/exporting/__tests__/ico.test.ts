import { describe, expect, it } from "vitest";
import { encodeIco } from "../lib/ico";

function pngBlob(bytes: number[]) {
  return new Blob([new Uint8Array(bytes)], { type: "image/png" });
}

describe("encodeIco", () => {
  it("writes an ICO directory with PNG payload offsets", async () => {
    const blob = await encodeIco([
      { size: 16, png: pngBlob([1, 2, 3]) },
      { size: 256, png: pngBlob([4, 5]) },
    ]);
    const view = new DataView(await blob.arrayBuffer());

    expect(blob.type).toBe("image/x-icon");
    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(2);
    expect(view.getUint8(6)).toBe(16);
    expect(view.getUint8(22)).toBe(0);
    expect(view.getUint32(14, true)).toBe(3);
    expect(view.getUint32(18, true)).toBe(38);
    expect(view.getUint32(30, true)).toBe(2);
    expect(view.getUint32(34, true)).toBe(41);
  });

  it("rejects entries larger than ICO can label", async () => {
    await expect(encodeIco([{ size: 512, png: pngBlob([1]) }])).rejects.toThrow(
      "ICO entries are limited to 256px",
    );
  });
});
