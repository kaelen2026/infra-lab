// 证件照规格库(China)。数据驱动:加规格只改这里。
//
// ⚠️ headHeightRatio(头顶→下巴 占成品高度的比例)为近似值,需逐条核对官方来源:
//   - 出入境证件(护照/签证)依《出入境证件相片照相指引》:头部长度 28–33mm / 48mm ≈ 0.58–0.69,取中 ~0.65
//   - 一寸/二寸/小一寸 无强制国标,照相馆常规约 0.70
//   - 居民身份证 以官方像素规格 358×441 为准,头部比例按常规 ~0.70
// 正式发布前请用 sourceUrl 替换为权威来源并校准比例。

export type BgColor = "white" | "blue" | "red";

export interface PhotoSpec {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  pxWidth: number;
  pxHeight: number;
  bgColors: BgColor[];
  /** 头顶→下巴 占成品高度的比例(近似,见文件头注释) */
  headHeightRatio: number;
  sourceUrl?: string;
}

export const BG_COLORS: Record<BgColor, { label: string; css: string }> = {
  white: { label: "白底", css: "#ffffff" },
  blue: { label: "蓝底", css: "#438edb" },
  red: { label: "红底", css: "#ff0000" },
};

export const SPECS: PhotoSpec[] = [
  {
    id: "cn-1in",
    name: "一寸",
    widthMm: 25,
    heightMm: 35,
    dpi: 300,
    pxWidth: 295,
    pxHeight: 413,
    bgColors: ["white", "blue", "red"],
    headHeightRatio: 0.7,
  },
  {
    id: "cn-2in",
    name: "二寸",
    widthMm: 35,
    heightMm: 49,
    dpi: 300,
    pxWidth: 413,
    pxHeight: 579,
    bgColors: ["white", "blue", "red"],
    headHeightRatio: 0.7,
  },
  {
    id: "cn-small-1in",
    name: "小一寸",
    widthMm: 22,
    heightMm: 32,
    dpi: 300,
    pxWidth: 260,
    pxHeight: 378,
    bgColors: ["white", "blue"],
    headHeightRatio: 0.7,
  },
  {
    id: "cn-id",
    name: "居民身份证",
    widthMm: 26,
    heightMm: 32,
    dpi: 350, // 官方以像素 358×441 为准
    pxWidth: 358,
    pxHeight: 441,
    bgColors: ["white"],
    headHeightRatio: 0.7,
  },
  {
    id: "cn-passport",
    name: "护照",
    widthMm: 33,
    heightMm: 48,
    dpi: 300,
    pxWidth: 390,
    pxHeight: 567,
    bgColors: ["white"],
    headHeightRatio: 0.65,
    sourceUrl: "https://www.nia.gov.cn/", // 国家移民管理局,正式发布前核对
  },
  {
    id: "cn-visa",
    name: "签证(常用)",
    widthMm: 33,
    heightMm: 48,
    dpi: 300,
    pxWidth: 390,
    pxHeight: 567,
    bgColors: ["white"],
    headHeightRatio: 0.65,
  },
];

const FIRST_SPEC = SPECS[0];
if (!FIRST_SPEC) throw new Error("SPECS 不能为空");
export const DEFAULT_SPEC: PhotoSpec = FIRST_SPEC;

export function getSpec(id: string): PhotoSpec {
  return SPECS.find((s) => s.id === id) ?? DEFAULT_SPEC;
}
