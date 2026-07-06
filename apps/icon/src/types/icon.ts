export type IconShape = "rounded" | "circle" | "squircle" | "square";

export type ForegroundMode = "image" | "text" | "icon" | "emoji";

export type TextFont = "sans" | "serif" | "mono";

export type BgType = "solid" | "linear" | "radial";

export type IconConfig = {
  fgMode: ForegroundMode;
  imageSrc: string | null;
  text: string;
  textColor: string;
  textFont: TextFont;
  iconName: string;
  iconColor: string;
  /** Lucide stroke width in the 24px viewBox (lucide's default is 2). */
  iconStroke: number;
  /** Emoji foreground; rendered with the OS emoji font, so color is built in. */
  emoji: string;
  appName: string;
  bgType: BgType;
  /** Linear gradient direction, CSS convention: 0° = up, clockwise. */
  bgAngle: number;
  bgColor1: string;
  bgColor2: string;
  shape: IconShape;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
};

export const defaultIconConfig: IconConfig = {
  fgMode: "icon",
  imageSrc: null,
  text: "A",
  textColor: "#4ade80",
  textFont: "mono",
  iconName: "Rocket",
  iconColor: "#4ade80",
  iconStroke: 2,
  emoji: "🚀",
  appName: "my-app",
  bgType: "linear",
  bgAngle: 135, // matches the old fixed top-left → bottom-right diagonal
  bgColor1: "#1a1a1f",
  bgColor2: "#2e2e36",
  shape: "rounded",
  scale: 62,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
};
