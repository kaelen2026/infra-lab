/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the auth/todo API. Defaults to http://localhost:3001 in dev. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
