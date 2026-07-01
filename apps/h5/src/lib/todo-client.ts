import { createWebTodoClient } from "@infra/sdk";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/** Single shared todo client (web cookie transport, same session as `authClient`). */
export const todoClient = createWebTodoClient(API_BASE);
