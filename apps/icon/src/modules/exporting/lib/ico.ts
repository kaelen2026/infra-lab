/**
 * Minimal ICO container with PNG-encoded entries. PNG-in-ICO is valid since
 * Windows Vista and is what every modern browser reads for favicons.
 */
export async function encodeIco(entries: { size: number; png: Blob }[]): Promise<Blob> {
  if (entries.some((e) => e.size > 256)) {
    // ICONDIRENTRY dimensions are single bytes (0 encodes 256) — larger
    // entries would silently mislabel the payload
    throw new Error("ICO entries are limited to 256px");
  }
  const buffers = await Promise.all(entries.map((e) => e.png.arrayBuffer()));

  const HEADER_BYTES = 6;
  const ENTRY_BYTES = 16;
  const dirBytes = HEADER_BYTES + ENTRY_BYTES * entries.length;
  const dir = new DataView(new ArrayBuffer(dirBytes));
  dir.setUint16(0, 0, true); // reserved
  dir.setUint16(2, 1, true); // resource type: icon
  dir.setUint16(4, entries.length, true);

  let offset = dirBytes;
  entries.forEach(({ size }, i) => {
    const buffer = buffers[i];
    if (!buffer) throw new Error("ICO entry buffer missing");
    const base = HEADER_BYTES + ENTRY_BYTES * i;
    const dimension = size >= 256 ? 0 : size; // 0 encodes 256
    dir.setUint8(base, dimension); // width
    dir.setUint8(base + 1, dimension); // height
    dir.setUint8(base + 2, 0); // palette colors (none)
    dir.setUint8(base + 3, 0); // reserved
    dir.setUint16(base + 4, 1, true); // color planes
    dir.setUint16(base + 6, 32, true); // bits per pixel
    dir.setUint32(base + 8, buffer.byteLength, true);
    dir.setUint32(base + 12, offset, true);
    offset += buffer.byteLength;
  });

  return new Blob([dir.buffer, ...buffers], { type: "image/x-icon" });
}
