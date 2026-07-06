import heroCompare from "./assets/hero-compare.png";

const STEPS = [
  { n: "01", t: "上传照片", d: "点击或拖入一张随手拍,JPG / PNG 都行" },
  { n: "02", t: "自动处理", d: "本地抠图,检测人脸,按规格居中、换底色" },
  { n: "03", t: "导出 / 打印", d: "精确像素导出,或排到 6 寸相纸直接冲印" },
];

const FEATURES = [
  { t: "六种规格", d: "一寸、二寸、小一寸、居民身份证、护照、签证,精确到像素与 DPI" },
  { t: "人脸自动居中", d: "MediaPipe 定位人脸,按规格控制头高占比与留白" },
  { t: "6 寸相纸排版", d: "一键平铺、正好一页,按真实尺寸打印或导出" },
  { t: "隐私优先", d: "抠图与识别都在浏览器本地运行,照片不离开你的设备" },
];

export default function Landing({ onStart }: { onStart: () => void }) {
  const cta =
    "rounded-md bg-seal px-6 py-3 text-sm font-medium text-white transition active:scale-[.97] hover:bg-[#9c2e24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/40";

  return (
    <div className="min-h-full bg-paper text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-baseline gap-2.5">
            <span className="font-serif text-xl tracking-wide">证件照</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              ID Photo
            </span>
          </div>
          <button
            type="button"
            onClick={onStart}
            className="rounded-sm px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-seal ring-1 ring-seal/40 transition active:scale-[.97] hover:bg-seal-tint"
          >
            开始制作
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5">
        {/* Hero */}
        <section className="grid items-center gap-10 py-14 lg:grid-cols-2 lg:py-20">
          <div className="flex flex-col items-start gap-6">
            <h1 className="font-serif text-3xl leading-[1.3] text-balance sm:text-4xl lg:text-5xl">
              在浏览器里,
              <br />
              做一张合规证件照
            </h1>
            <p className="max-w-md text-[15px] leading-relaxed text-ink-soft">
              上传随手拍,自动抠图、按规格把人脸居中、换标准底色,导出精确像素,还能排到 6
              寸相纸直接冲印。
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" onClick={onStart} className={cta}>
                开始制作
              </button>
              <span className="font-mono text-xs tracking-wider text-ink-faint">
                无需注册 · 打开即用
              </span>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-line bg-surface p-3">
            <img
              src={heroCompare}
              alt="同一张照片处理前后对比:去背景、白底、人脸居中"
              className="w-full rounded-sm"
              width={558}
              height={391}
            />
          </div>
        </section>

        {/* Privacy strip */}
        <section className="flex items-center gap-4 rounded-lg border border-seal/25 bg-seal-tint px-6 py-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-seal font-serif text-base text-white">
            密
          </span>
          <p className="text-sm leading-relaxed text-ink">
            图片全程在浏览器本地处理,不会上传到任何服务器。AI 模型首次从 CDN
            下载后由浏览器缓存,之后离线即可使用。
          </p>
        </section>

        {/* How it works */}
        <section className="py-16">
          <h2 className="mb-8 font-serif text-2xl">三步搞定</h2>
          <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex flex-col gap-2 bg-surface px-6 py-7">
                <span className="font-mono text-sm text-seal">{s.n}</span>
                <span className="font-serif text-lg">{s.t}</span>
                <span className="text-sm leading-relaxed text-ink-soft">{s.d}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section className="pb-16">
          <h2 className="mb-8 font-serif text-2xl">为什么好用</h2>
          <dl className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.t} className="border-t border-line pt-4">
                <dt className="mb-1.5 font-serif text-lg">{f.t}</dt>
                <dd className="text-sm leading-relaxed text-ink-soft">{f.d}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Final CTA */}
        <section className="flex flex-col items-center gap-5 border-t border-line py-16 text-center">
          <h2 className="font-serif text-2xl">准备好了?</h2>
          <button type="button" onClick={onStart} className={cta}>
            开始制作证件照
          </button>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-ink-faint sm:flex-row">
          <span>规格仅供参考,正式使用前请核对官方要求。</span>
          <a
            href="https://github.com/kaelen2026/id-photo-app"
            target="_blank"
            rel="noreferrer"
            className="font-mono uppercase tracking-wider transition hover:text-ink"
          >
            源码 · GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
