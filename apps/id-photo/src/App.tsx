import { useCallback, useEffect, useRef, useState } from "react";
import Landing from "./Landing";
import { canvasToBlob, compose, downloadBlob } from "./lib/compose";
import { detectFace, type FaceGeometry } from "./lib/face";
import { type LoadProgress, removeBackground } from "./lib/matting";
import { composeSheet, type SheetLayout } from "./lib/sheet";
import { BG_COLORS, type BgColor, DEFAULT_SPEC, getSpec, SPECS } from "./lib/specs";

type Stage = "idle" | "processing" | "ready" | "sheet" | "error";
type View = "home" | "tool";

// 证件照定位角标:四角红色 tick,把图像框成"待签发"的样子
function CornerFrame({ children }: { children: React.ReactNode }) {
  const tick = "pointer-events-none absolute h-3.5 w-3.5 border-seal";
  return (
    <div className="relative inline-block p-3">
      <span className={`${tick} left-0 top-0 border-l-2 border-t-2`} />
      <span className={`${tick} right-0 top-0 border-r-2 border-t-2`} />
      <span className={`${tick} bottom-0 left-0 border-b-2 border-l-2`} />
      <span className={`${tick} bottom-0 right-0 border-b-2 border-r-2`} />
      {children}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("home");
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<LoadProgress>({ percent: 0, status: "" });
  const [error, setError] = useState("");
  const [specId, setSpecId] = useState(DEFAULT_SPEC.id);
  const [bg, setBg] = useState<BgColor>("white");
  const [faceDetected, setFaceDetected] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetLayout, setSheetLayout] = useState<SheetLayout | null>(null);
  const [originalUrl, setOriginalUrl] = useState("");
  const originalUrlRef = useRef(""); // 持有当前原图 objectURL,供预览 + 适时回收
  const cutoutRef = useRef<ImageData | null>(null);
  const faceRef = useRef<FaceGeometry | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const sheetCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const spec = getSpec(specId);

  // 切换规格时,把底色钳到该规格允许的范围
  useEffect(() => {
    const fallback = spec.bgColors[0];
    if (fallback && !spec.bgColors.includes(bg)) setBg(fallback);
  }, [spec, bg]);

  const redraw = useCallback(async () => {
    if (!cutoutRef.current || !previewRef.current) return;
    const canvas = await compose(cutoutRef.current, spec, bg, faceRef.current);
    const target = previewRef.current;
    target.width = canvas.width;
    target.height = canvas.height;
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(canvas, 0, 0);
  }, [spec, bg]);

  useEffect(() => {
    if (stage === "ready") void redraw();
  }, [stage, redraw]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件(JPG / PNG 等)");
      setStage("error");
      return;
    }
    setStage("processing");
    setError("");
    setProgress({ percent: 0, status: "准备中" });
    // 原图 objectURL 既喂给抠图,也留作原图预览(在 reset / 下次上传时回收)
    if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
    const url = URL.createObjectURL(file);
    originalUrlRef.current = url;
    setOriginalUrl(url);
    let bitmap: ImageBitmap | null = null;
    try {
      // 单次解码并显式套用 EXIF 朝向;抠图与人脸检测共用这张正向位图,
      // 避免两条解码路径朝向不一致导致旋转照片被裁歪
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const cutout = await removeBackground(bitmap, setProgress);
      cutoutRef.current = cutout;

      setProgress({ percent: 100, status: "正在识别人脸" });
      let face: FaceGeometry | null = null;
      try {
        face = await detectFace(bitmap, bitmap.width, bitmap.height);
      } catch {
        face = null; // 人脸识别失败不阻断流程,退回默认排版
      }
      faceRef.current = face;
      setFaceDetected(!!face);
      setStage("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "处理失败,请换一张图片重试");
      setStage("error");
    } finally {
      bitmap?.close();
    }
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };
  const onExport = async () => {
    if (!previewRef.current) return;
    const blob = await canvasToBlob(previewRef.current);
    downloadBlob(blob, `证件照_${spec.name}_${spec.pxWidth}x${spec.pxHeight}.png`);
  };
  const openSheet = () => {
    if (!previewRef.current) return;
    const { canvas, layout } = composeSheet(previewRef.current);
    sheetCanvasRef.current = canvas;
    setSheetLayout(layout);
    setSheetUrl(canvas.toDataURL("image/png"));
    setStage("sheet");
  };
  const onDownloadSheet = async () => {
    if (!sheetCanvasRef.current) return;
    const blob = await canvasToBlob(sheetCanvasRef.current);
    downloadBlob(blob, `相纸排版_${spec.name}_6寸.png`);
  };
  const reset = () => {
    cutoutRef.current = null;
    faceRef.current = null;
    sheetCanvasRef.current = null;
    if (originalUrlRef.current) {
      URL.revokeObjectURL(originalUrlRef.current);
      originalUrlRef.current = "";
    }
    setOriginalUrl("");
    setSheetUrl("");
    setStage("idle");
    setError("");
  };

  const btnBase =
    "rounded-md px-5 py-2.5 text-sm font-medium transition active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40";
  const btnPrimary = `${btnBase} bg-seal text-white hover:bg-[#9c2e24]`;
  const btnOutline = `${btnBase} border border-ink/30 text-ink hover:bg-ink/5`;
  const btnGhost = `${btnBase} text-ink-soft hover:bg-ink/5`;

  if (view === "home") return <Landing onStart={() => setView("tool")} />;

  return (
    <>
      <div className="flex min-h-full flex-col bg-paper text-ink print:hidden">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
            <div className="flex items-baseline gap-2.5">
              <button
                type="button"
                onClick={() => setView("home")}
                className="font-serif text-xl tracking-wide text-ink transition hover:text-seal"
              >
                证件照
              </button>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                ID Photo
              </span>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-wider text-seal ring-1 ring-seal/40 rounded-sm px-2 py-1">
              本地处理 · 不上传
            </span>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-10">
          {stage === "idle" && (
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="group flex min-h-80 cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border border-line bg-surface text-center transition-colors [@media(hover:hover)]:hover:border-seal/50 focus-within:ring-2 focus-within:ring-seal/40"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-md border border-line font-serif text-2xl text-ink-soft transition-colors [@media(hover:hover)]:group-hover:border-seal/50 [@media(hover:hover)]:group-hover:text-seal">
                证
              </span>
              <span className="text-[15px] font-medium text-ink">点击或拖入一张照片</span>
              <span className="max-w-xs text-sm text-ink-soft">
                自动抠图,按规格居中,导出标准证件照
              </span>
              <input type="file" accept="image/*" className="sr-only" onChange={onInputChange} />
            </label>
          )}

          {stage === "processing" && (
            <div className="flex min-h-80 flex-col items-center justify-center gap-5 rounded-lg border border-line bg-surface">
              <div className="w-64">
                <div className="mb-2 flex items-baseline justify-between text-sm">
                  <span className="text-ink-soft">{progress.status || "处理中"}</span>
                  <span className="tnum font-mono text-xs text-ink">{progress.percent}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-sm bg-line">
                  <div
                    className="h-full bg-seal transition-[width] duration-300"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
              <p className="max-w-xs text-center text-xs leading-relaxed text-ink-faint">
                首次使用需下载 AI
                模型到你的设备,之后会缓存、秒开。模型在本地运行,照片不会离开你的浏览器。
              </p>
            </div>
          )}

          {stage === "ready" && (
            <div className="flex flex-col items-center gap-7">
              <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-center sm:gap-8">
                {/* 原图 */}
                <figure className="flex flex-col items-center gap-2">
                  <div className="flex h-[300px] w-[210px] items-center justify-center rounded-sm border border-line bg-paper p-2">
                    <img
                      src={originalUrl}
                      alt="上传的原图"
                      className="max-h-full max-w-full object-contain"
                      style={{ outline: "1px solid rgba(0,0,0,0.08)", outlineOffset: "-1px" }}
                    />
                  </div>
                  <figcaption className="font-mono text-[11px] tracking-wider text-ink-faint">
                    原图
                  </figcaption>
                </figure>

                {/* 箭头分隔(仅桌面) */}
                <span className="hidden font-mono text-ink-faint sm:inline">→</span>

                {/* 成品 */}
                <figure className="flex flex-col items-center gap-2">
                  <div className="relative">
                    <CornerFrame>
                      <canvas
                        ref={previewRef}
                        className="block rounded-sm ring-1 ring-line"
                        style={{ maxHeight: 300, width: "auto" }}
                      />
                    </CornerFrame>
                    {/* 签名时刻:就绪时红色印章落章 */}
                    <span
                      key={faceDetected ? "face" : "fallback"}
                      className={`seal-stamp absolute -right-2 top-1 rotate-[-3deg] rounded-sm border px-2 py-1 font-serif text-xs ${
                        faceDetected
                          ? "border-seal/70 bg-seal-tint text-seal"
                          : "border-amber-500/60 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {faceDetected ? "人脸已居中" : "默认排版"}
                    </span>
                  </div>
                  <figcaption className="font-mono text-[11px] tracking-wider text-ink-faint">
                    成品 · {spec.name}
                  </figcaption>
                </figure>
              </div>

              <div className="flex w-full max-w-md flex-col gap-5 rounded-lg border border-line bg-surface p-5">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="spec-select" className="text-sm text-ink-soft">
                    规格
                  </label>
                  <select
                    id="spec-select"
                    value={specId}
                    onChange={(e) => setSpecId(e.target.value)}
                    className="rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40"
                  >
                    {SPECS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 规格表:等宽数字,像一张正式尺寸单 */}
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-y border-line py-3 text-sm">
                  <dt className="text-ink-faint">尺寸</dt>
                  <dd className="tnum text-right font-mono text-ink">
                    {spec.widthMm} × {spec.heightMm} mm
                  </dd>
                  <dt className="text-ink-faint">像素</dt>
                  <dd className="tnum text-right font-mono text-ink">
                    {spec.pxWidth} × {spec.pxHeight} px
                  </dd>
                  <dt className="text-ink-faint">精度</dt>
                  <dd className="tnum text-right font-mono text-ink">{spec.dpi} DPI</dd>
                </dl>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-soft">底色</span>
                  <div className="flex gap-2">
                    {spec.bgColors.map((c) => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setBg(c)}
                        aria-label={BG_COLORS[c].label}
                        className={`h-7 w-7 rounded-sm border transition active:scale-95 ${
                          bg === c
                            ? "border-ink ring-2 ring-seal ring-offset-1 ring-offset-surface"
                            : "border-line"
                        }`}
                        style={{ backgroundColor: BG_COLORS[c].css }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-3">
                <button type="button" onClick={onExport} className={btnPrimary}>
                  导出 {spec.name}
                </button>
                <button type="button" onClick={openSheet} className={btnOutline}>
                  排版打印（6 寸相纸）
                </button>
                <button type="button" onClick={reset} className={btnGhost}>
                  换一张
                </button>
              </div>
            </div>
          )}

          {stage === "sheet" && (
            <div className="flex flex-col items-center gap-6">
              <CornerFrame>
                <img
                  src={sheetUrl}
                  alt="相纸排版预览"
                  className="block max-h-[380px] w-auto rounded-sm ring-1 ring-line"
                />
              </CornerFrame>
              {sheetLayout && (
                <span className="font-mono text-xs tracking-wide text-ink-soft">
                  <span className="tnum">6</span> 寸相纸 · {sheetLayout.cols}×{sheetLayout.rows} ·
                  共 <span className="tnum">{sheetLayout.count}</span> 张（{spec.name}）
                </span>
              )}
              <div className="flex flex-wrap justify-center gap-3">
                <button type="button" onClick={() => window.print()} className={btnPrimary}>
                  打印
                </button>
                <button type="button" onClick={onDownloadSheet} className={btnOutline}>
                  下载排版图
                </button>
                <button type="button" onClick={() => setStage("ready")} className={btnGhost}>
                  返回
                </button>
              </div>
              <p className="max-w-sm text-center text-xs leading-relaxed text-ink-faint">
                已按 6 寸（6×4 英寸）相纸排版。打印时选 6 寸相纸、缩放保持
                100%（不要「适应页面」),即可按实际尺寸冲印。
              </p>
            </div>
          )}

          {stage === "error" && (
            <div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-lg border border-seal/30 bg-seal-tint">
              <p className="text-seal">{error}</p>
              <button type="button" onClick={reset} className={btnOutline}>
                重试
              </button>
            </div>
          )}

          <p className="mt-auto pt-10 text-center text-xs text-ink-faint">
            规格仅供参考,正式使用前请核对官方要求。
          </p>
        </main>
      </div>

      {/* 打印专用:仅在相纸视图下渲染,避免其它阶段误触 Cmd+P 打出旧排版图。
          @page 尺寸按相纸朝向锁成 6×4in,让排版图正好占满一页、不溢出到第二页,
          且按真实证件尺寸打印。 */}
      {stage === "sheet" && sheetUrl && sheetLayout && (
        <div className="hidden print:block">
          <style>{`@page{size:${
            sheetLayout.sheetW > sheetLayout.sheetH ? "6in 4in" : "4in 6in"
          };margin:0}`}</style>
          <img
            src={sheetUrl}
            alt="相纸排版"
            style={{ display: "block", width: "100%", height: "auto", breakInside: "avoid" }}
          />
        </div>
      )}
    </>
  );
}
