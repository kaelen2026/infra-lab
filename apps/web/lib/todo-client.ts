import { createWebTodoClient } from "@infra/sdk";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Single shared web todo client (cookie transport). */
export const todoClient = createWebTodoClient(API_BASE);
