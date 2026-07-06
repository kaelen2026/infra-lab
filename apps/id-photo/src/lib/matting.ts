// RMBG-1.4 抠图封装。浏览器本地推理,WebGPU 优先、WASM 兜底。
// 图片全程不离开设备(模型权重从 HF CDN 拉一次后由浏览器缓存)。
import {
  AutoModel,
  AutoProcessor,
  env,
  type PreTrainedModel,
  type Processor,
  RawImage,
} from "@huggingface/transformers";

// 只从 HF Hub 取模型,不找本地路径
env.allowLocalModels = false;

const MODEL_ID = "briaai/RMBG-1.4";

export type LoadProgress = {
  /** 0–100,跨所有权重文件聚合 */
  percent: number;
  status: string;
};

type ProgressCb = (p: LoadProgress) => void;

let modelPromise: Promise<{ model: PreTrainedModel; processor: Processor }> | null = null;

function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

// 聚合多文件下载进度
function makeAggregator(cb?: ProgressCb) {
  const files = new Map<string, { loaded: number; total: number }>();
  return (data: { status?: string; file?: string; loaded?: number; total?: number }) => {
    if (!cb) return;
    if (data.status === "progress" && data.file && data.total) {
      files.set(data.file, { loaded: data.loaded ?? 0, total: data.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      const percent = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
      cb({ percent, status: "正在下载模型(仅首次)" });
    } else if (data.status === "ready" || data.status === "done") {
      cb({ percent: 100, status: "模型就绪" });
    }
  };
}

// RMBG-1.4 的 processor 配置(transformers.js 社区已验证的取值)
const PROCESSOR_CONFIG = {
  do_normalize: true,
  do_pad: false,
  do_rescale: true,
  do_resize: true,
  image_mean: [0.5, 0.5, 0.5],
  image_std: [1, 1, 1],
  resample: 2,
  rescale_factor: 1 / 255,
  size: { width: 1024, height: 1024 },
};

export async function loadMatter(cb?: ProgressCb) {
  if (modelPromise) return modelPromise;
  const progress_callback = makeAggregator(cb);
  const device = hasWebGPU() ? "webgpu" : "wasm";
  // 量化以缩小首屏下载:WebGPU 用 fp16(~88MB,画质近 fp32);
  // WASM 兜底用 q8(~44MB,慢路径上体积优先)。避免默认拉 ~176MB 的 fp32。
  const dtype = device === "webgpu" ? "fp16" : "q8";

  modelPromise = (async () => {
    try {
      const model = await AutoModel.from_pretrained(MODEL_ID, {
        // @ts-expect-error config.model_type 'custom' 是 RMBG 的加载约定
        config: { model_type: "custom" },
        device,
        dtype,
        progress_callback,
      });
      const processor = await AutoProcessor.from_pretrained(MODEL_ID, {
        config: PROCESSOR_CONFIG,
        progress_callback,
      });
      return { model, processor };
    } catch (err) {
      // WebGPU 失败 → 退回 WASM 再试一次
      if (device === "webgpu") {
        const model = await AutoModel.from_pretrained(MODEL_ID, {
          // @ts-expect-error 见上
          config: { model_type: "custom" },
          device: "wasm",
          dtype: "q8",
          progress_callback,
        });
        const processor = await AutoProcessor.from_pretrained(MODEL_ID, {
          config: PROCESSOR_CONFIG,
          progress_callback,
        });
        return { model, processor };
      }
      throw err;
    }
  })().catch((err) => {
    // 加载失败不缓存,否则后续"重试"会拿到同一个 rejected promise 而永不重试
    modelPromise = null;
    throw err;
  });

  return modelPromise;
}

/** 从已解码的位图构建 RawImage(RGBA),朝向由调用方确定,避免二次解码导致 EXIF 朝向漂移 */
function rawImageFromBitmap(bitmap: ImageBitmap): RawImage {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法获取 2D canvas 上下文");
  ctx.drawImage(bitmap, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return new RawImage(new Uint8ClampedArray(data), width, height, 4);
}

/**
 * 对一张已解码、朝向正确的位图抠图,返回带透明通道的前景(原尺寸)。
 * 入参用 ImageBitmap 而非 URL:让抠图与人脸检测共用同一张位图,杜绝两条解码路径 EXIF 朝向不一致。
 * @returns ImageData(原始宽高,背景已透明)
 */
export async function removeBackground(source: ImageBitmap, cb?: ProgressCb): Promise<ImageData> {
  const { model, processor } = await loadMatter(cb);
  cb?.({ percent: 100, status: "正在抠图" });

  const image = rawImageFromBitmap(source);
  const { pixel_values } = await processor(image);
  const output = await model({ input: pixel_values });

  // 取出 alpha mask,缩放回原图尺寸
  const maskTensor = (output.output ?? Object.values(output)[0]) as {
    mul: (n: number) => { to: (t: string) => unknown };
  };
  const mask = await RawImage.fromTensor(
    // @ts-expect-error tensor 运算链返回类型在 d.ts 中不完整
    maskTensor[0].mul(255).to("uint8"),
  ).resize(image.width, image.height);

  // 把 mask 写进 alpha 通道
  const rgba = image.rgba();
  const out = new Uint8ClampedArray(rgba.data);
  for (let i = 0; i < mask.data.length; i++) {
    out[i * 4 + 3] = mask.data[i] ?? 0;
  }
  return new ImageData(out, image.width, image.height);
}
