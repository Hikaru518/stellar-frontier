/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Populated at runtime by `main.tsx` (browser) or `src/test/setup.ts` (vitest)
// from `import.meta.env.VITE_APP_VERSION`. Used by App.tsx & logger envelope.
declare const __APP_VERSION__: string;
