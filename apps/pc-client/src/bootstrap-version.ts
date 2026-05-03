// Side-effect-only module: populate globalThis.__APP_VERSION__ from
// import.meta.env.VITE_APP_VERSION. Vite injects VITE_* env vars from
// process.env automatically (configured in vite.config.ts). Imported as
// the very first line of main.tsx so any module reading __APP_VERSION__
// (App.tsx via vite-env.d.ts global, logger envelope via globalThis) sees
// the resolved value.

(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ =
  import.meta.env.VITE_APP_VERSION;
