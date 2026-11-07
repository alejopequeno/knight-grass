import { SusanoLoader } from '@joycostudio/susano'
import type { MSDFFont } from 'lettra'
import { loadFont, loadFontTexture } from 'lettra/three'
import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { TextureLoader, type Texture } from 'three/webgpu'

type ProgressCallback = (event: ProgressEvent) => void

/**
 * Susano loader that also counts bytes, so the loading bar can weigh a 9 MB
 * model above a 16 KB texture instead of treating every file as one tick.
 * `bytesTotal` stays 0 while the server has not sent a Content-Length.
 */
export abstract class TrackedAssetLoader<T> extends SusanoLoader<T> {
  bytesLoaded = 0
  bytesTotal = 0

  protected abstract fetchAsset(onProgress: ProgressCallback): Promise<T>

  protected _load(): void {
    this.bytesLoaded = 0
    this.fetchAsset((event) => this.trackBytes(event))
      .then((content) => {
        this.content = content
        this._onLoaded()
      })
      .catch((error: unknown) => this._onError(error))
  }

  private trackBytes(event: ProgressEvent): void {
    this.bytesLoaded = event.loaded
    if (event.lengthComputable) this.bytesTotal = event.total
    if (this.bytesTotal > 0) this._onProgress(Math.min(event.loaded / this.bytesTotal, 1))
  }
}

// One parser instance per format for the whole session.
const gltfLoader = new GLTFLoader()
const fbxLoader = new FBXLoader()
const hdrLoader = new HDRLoader()
const textureLoader = new TextureLoader()

export class GltfAssetLoader extends TrackedAssetLoader<GLTF> {
  protected fetchAsset(onProgress: ProgressCallback): Promise<GLTF> {
    return gltfLoader.loadAsync(this.url, onProgress)
  }
}

export class FbxAssetLoader extends TrackedAssetLoader<THREE.Group> {
  protected fetchAsset(onProgress: ProgressCallback): Promise<THREE.Group> {
    return fbxLoader.loadAsync(this.url, onProgress)
  }
}

/** An equirectangular HDRI, ready to attach as `scene.environment`. */
export class EnvironmentAssetLoader extends TrackedAssetLoader<THREE.DataTexture> {
  protected async fetchAsset(onProgress: ProgressCallback): Promise<THREE.DataTexture> {
    const texture = await hdrLoader.loadAsync(this.url, onProgress)
    texture.mapping = THREE.EquirectangularReflectionMapping
    return texture
  }
}

export class TextureAssetLoader extends TrackedAssetLoader<Texture> {
  protected fetchAsset(onProgress: ProgressCallback): Promise<Texture> {
    return textureLoader.loadAsync(this.url, onProgress)
  }
}

/** MSDF glyph metrics (the font's JSON). Lettra reports no progress. */
export class MsdfFontAssetLoader extends TrackedAssetLoader<MSDFFont> {
  protected fetchAsset(): Promise<MSDFFont> {
    return loadFont(this.url)
  }
}

/** MSDF glyph atlas, configured by lettra for distance-field sampling. */
export class FontAtlasAssetLoader extends TrackedAssetLoader<Texture> {
  protected fetchAsset(): Promise<Texture> {
    return loadFontTexture(this.url)
  }
}

/** The Susano registry: its keys are the valid asset `type`s. */
export const ASSET_LOADERS = {
  gltf: GltfAssetLoader,
  fbx: FbxAssetLoader,
  environment: EnvironmentAssetLoader,
  texture: TextureAssetLoader,
  'msdf-font': MsdfFontAssetLoader,
  'font-atlas': FontAtlasAssetLoader,
}

export type AssetLoaderRegistry = typeof ASSET_LOADERS
export type AssetType = keyof AssetLoaderRegistry
