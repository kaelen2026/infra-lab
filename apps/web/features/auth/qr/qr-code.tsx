"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

interface QrCodeProps {
  /** The text to encode (here: the login ticket id). */
  value: string;
  size?: number;
}

/** Renders `value` as a QR code data-URL image, generated client-side. */
export function QrCode({ value, size = 232 }: QrCodeProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc(null);
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  return (
    <div
      className="grid place-items-center rounded-xl border bg-white p-3"
      style={{ width: size + 24, height: size + 24 }}
    >
      {src ? (
        // The QR encodes only the public ticket id — no secret.
        // biome-ignore lint/performance/noImgElement: a client-generated data URL, not a remote asset.
        <img src={src} alt="登录二维码" width={size} height={size} />
      ) : (
        <div className="size-full animate-pulse rounded-lg bg-muted" />
      )}
    </div>
  );
}
