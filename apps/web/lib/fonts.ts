import { Hanken_Grotesk, JetBrains_Mono, Spectral } from "next/font/google";

/** Display + reading serif with a warm, literary voice (Production Type). */
export const serif = Spectral({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-spectral",
  display: "swap",
});

/** Warm humanist grotesque for UI, body, labels, buttons. */
export const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "swap",
});

/** Data face: phone numbers, tokens, timestamps, IPs. */
export const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});
