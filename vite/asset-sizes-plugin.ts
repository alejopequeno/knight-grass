import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'

const VIRTUAL_ID = 'virtual:asset-sizes'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  })
}

function toPublicUrl(publicDir: string, file: string): string {
  return `/${relative(publicDir, file).split(sep).join('/')}`
}

/**
 * Exposes `virtual:asset-sizes`: the on-disk byte size of every file in
 * `public/`, keyed by its URL. The loading bar weighs files with it before
 * (or instead of, when compressed) the server's Content-Length.
 */
export function assetSizes(): Plugin {
  let publicDir = ''
  return {
    name: 'asset-sizes',
    configResolved(config) {
      publicDir = config.publicDir
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined
      const files = publicDir ? listFiles(publicDir) : []
      const sizes = Object.fromEntries(files.map((file) => [toPublicUrl(publicDir, file), statSync(file).size]))
      return `export default ${JSON.stringify(sizes)}`
    },
  }
}
