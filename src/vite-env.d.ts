/// <reference types="vite/client" />

/** Byte size of every file in public/, keyed by URL (see vite/asset-sizes-plugin.ts). */
declare module 'virtual:asset-sizes' {
  const sizes: Readonly<Record<string, number>>
  export default sizes
}
