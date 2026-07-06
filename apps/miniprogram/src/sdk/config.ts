/**
 * API base URL. For local dev, point the WeChat devtools at the running API
 * (`pnpm dev:api`, :3001) and tick 详情 → 本地设置 → 不校验合法域名. In production
 * this must be an ICP-备案'd HTTPS domain whitelisted in the mp console (request
 * 合法域名) — see README「合规」.
 */
export const API_BASE_URL = "http://localhost:3001";
