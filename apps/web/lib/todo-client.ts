import { createWebTodoClient } from "@infra/sdk";

import { env } from "./env";

/** Single shared web todo client (cookie transport). */
export const todoClient = createWebTodoClient(env.apiBaseUrl);
