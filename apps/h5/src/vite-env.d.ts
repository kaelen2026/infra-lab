/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the auth/todo API. Defaults to http://localhost:3001 in dev. */
  readonly VITE_API_URL?: string;
  /**
   * "true" shows the Google sign-in button. The backend enables Google only when its
   * GOOGLE_CLIENT_ID/SECRET are set (no public config endpoint), so keep this in sync
   * with the backend. Default (unset) hides the button.
   */
  readonly VITE_GOOGLE_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
