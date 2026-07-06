import { ImageResponse } from "next/og";
import { siteUrl } from "@/lib/site";

export const alt = "App Icon Generator — free iOS, Android, PWA, and favicon packs in your browser";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        backgroundColor: "#0a0a0b",
        color: "#d6d6d9",
        fontFamily: "monospace",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <div
          style={{
            width: 160,
            height: 160,
            borderRadius: 36,
            backgroundColor: "#4ade80",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 96,
            color: "#0a0a0b",
          }}
        >
          A
        </div>
        <div
          style={{
            width: 160,
            height: 160,
            borderRadius: 80,
            border: "2px solid #3a3a42",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 96,
            color: "#4ade80",
          }}
        >
          A
        </div>
        <div
          style={{
            width: 160,
            height: 160,
            borderRadius: 8,
            backgroundColor: "#161619",
            border: "2px solid #232328",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 96,
            color: "#d6d6d9",
          }}
        >
          A
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", fontSize: 58, color: "#d6d6d9" }}>App Icon Generator</div>
        <div style={{ display: "flex", fontSize: 30, color: "#76767f" }}>
          iOS · Android · PWA · favicon — one ZIP, rendered in your browser
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#4ade80" }}>
          {siteUrl.replace("https://", "")}
        </div>
      </div>
    </div>,
    {
      ...size,
    },
  );
}
