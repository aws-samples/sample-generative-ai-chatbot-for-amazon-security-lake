/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REST_API_URL: string;
  readonly VITE_WEBSOCKET_URL: string;
  readonly VITE_API_KEY: string;
  // Add other environment variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
