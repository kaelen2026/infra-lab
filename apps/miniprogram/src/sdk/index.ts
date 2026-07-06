import {
  type AuthClient,
  createAuthClient,
  createTodoClient,
  HttpAuthError,
  type TodoClient,
} from "@infra/sdk";
import { API_BASE_URL } from "./config";
import { wxFetch } from "./wx-fetch";
import { wxTokenStore } from "./wx-token-store";

/** Platform identity the mini-program presents to the API (Bearer transport). */
export const WEAPP_PLATFORM = "weapp" as const;

const shared = {
  baseUrl: API_BASE_URL,
  platform: WEAPP_PLATFORM,
  tokens: wxTokenStore,
  fetch: wxFetch,
} as const;

/** Shared SDK clients — same Bearer flow as native/CLI, wired to wx transport + storage. */
export const auth: AuthClient = createAuthClient(shared);
export const todo: TodoClient = createTodoClient(shared);

export { deviceInfo } from "./device";
export { withRefresh } from "./with-refresh";
export { wxTokenStore } from "./wx-token-store";
export { HttpAuthError };
