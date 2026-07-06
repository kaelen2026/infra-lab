// 人脸定位:MediaPipe FaceLandmarker。用于按规格控制头高占比 + 居中。
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const VERSION = "0.10.35";
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// 468 点 face mesh 的关键索引
const IDX = { chin: 152, foreheadTop: 10, noseTip: 1 };

// FaceLandmarker 的关键点最高只到上额(landmark 10),不含头顶/头发。
// 头顶按"上额往上延伸 额-颏距离的 CROWN_FACTOR 倍"估算。经验值,QA 后可调。
const CROWN_FACTOR = 0.5;

export interface FaceGeometry {
  crownY: number; // 估算头顶 y(px)
  chinY: number; // 下巴 y(px)
  centerX: number; // 人脸水平中心 x(px)
  headHeightPx: number; // crown→chin
}

let lmPromise: Promise<FaceLandmarker> | null = null;

export async function loadFaceLandmarker() {
  if (lmPromise) return lmPromise;
  lmPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM);
    const make = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: "IMAGE",
        numFaces: 1,
      });
    try {
      return await make("GPU");
    } catch {
      return await make("CPU"); // 无 WebGL 时退回 CPU
    }
  })().catch((e) => {
    lmPromise = null; // 失败不缓存,允许重试
    throw e;
  });
  return lmPromise;
}

/**
 * 检测单张人脸,返回头顶/下巴/中心(原图像素坐标)。无清晰人脸返回 null。
 */
export async function detectFace(
  image: ImageBitmap,
  width: number,
  height: number,
): Promise<FaceGeometry | null> {
  const lm = await loadFaceLandmarker();
  const res = lm.detect(image);
  const faces = res.faceLandmarks;
  if (!faces || faces.length === 0) return null;
  const pts = faces[0];
  const chin = pts?.[IDX.chin];
  const forehead = pts?.[IDX.foreheadTop];
  const nose = pts?.[IDX.noseTip];
  if (!chin || !forehead || !nose) return null;
  const chinY = chin.y * height;
  const foreheadY = forehead.y * height;
  const faceSpan = chinY - foreheadY;
  if (faceSpan <= 0) return null;
  const crownY = foreheadY - faceSpan * CROWN_FACTOR;
  return {
    crownY,
    chinY,
    centerX: nose.x * width,
    headHeightPx: chinY - crownY,
  };
}
