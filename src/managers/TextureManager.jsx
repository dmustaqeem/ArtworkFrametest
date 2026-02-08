import * as THREE from "three";

/**
 * TextureManager - Manages texture loading, processing, and utilities
 */
export class TextureManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.loader = new THREE.TextureLoader();
    this.loadedTextures = new Map();
  }

  /**
   * Configure texture (basic settings only, no processing)
   */
  makePrintTextureCrisp(tex) {
    if (!tex) return;
    // No processing applied - just return texture as-is
    return tex;
  }

  /**
   * Load texture from path
   */
  loadTexture(path, onLoad, onError) {
    // Check cache
    if (this.loadedTextures.has(path)) {
      const cachedTex = this.loadedTextures.get(path);
      if (onLoad) onLoad(cachedTex);
      return cachedTex;
    }

    this.loader.load(
      path,
      (tex) => {
        this.loadedTextures.set(path, tex);
        if (onLoad) onLoad(tex);
      },
      undefined, // onProgress
      (error) => {
        if (onError) onError(error);
      }
    );
  }

  /**
   * Make specific color pixels transparent (disabled - returns original image)
   */
  replaceWhiteWithMetalColor(image, metalColorType, threshold = 0.9, colorToRemove = null, colorTolerance = 10, enableColorRemoval = true) {
    // No processing - return original image
    return image;
  }

  /**
   * Fill alpha/transparent areas with white color (disabled - returns original image)
   */
  fillAlphaWithWhite(image) {
    // No processing - return original image
    return image;
  }

  /**
   * Brighten an image (disabled - returns original image)
   */
  brightenImage(image, brightnessFactor = 1.2) {
    // No processing - return original image
    return image;
  }

  /**
   * Create texture from image/canvas (no processing applied)
   * Matches working test app settings: ClampToEdge, no mipmaps, linear filter
   * @param {HTMLImageElement|HTMLCanvasElement} image - Source image
   * @param {Object} options - Options (flipY, colorSpace)
   */
  createTextureFromImage(image, options = {}) {
    // Create texture directly without any processing
    const tex = new THREE.Texture(image);
    
    // Match working test app texture settings
    tex.wrapS = THREE.ClampToEdgeWrapping;    // No horizontal tiling
    tex.wrapT = THREE.ClampToEdgeWrapping;    // No vertical tiling
    tex.generateMipmaps = false;               // No mipmap generation (avoids alpha artifacts)
    tex.minFilter = THREE.LinearFilter;       // Linear filtering
    tex.magFilter = THREE.LinearFilter;       // Linear filtering
    tex.needsUpdate = true;                   // Mark for GPU update
    
    // Apply basic options
    if (options.flipY !== undefined) tex.flipY = options.flipY;
    if (options.colorSpace) tex.colorSpace = options.colorSpace;
    else tex.colorSpace = THREE.SRGBColorSpace; // Default to SRGB
    
    return tex;
  }

  /**
   * Static helper to create texture with working app settings (for fallback cases)
   * @param {HTMLImageElement|HTMLCanvasElement} image - Source image
   * @param {Object} options - Options (flipY, colorSpace)
   */
  static createTextureWithSettings(image, options = {}) {
    const tex = new THREE.Texture(image);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    if (options.flipY !== undefined) tex.flipY = options.flipY;
    if (options.colorSpace) tex.colorSpace = options.colorSpace;
    else tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * Get texture loader
   */
  getLoader() {
    return this.loader;
  }

  /**
   * Clear texture cache
   */
  clearCache() {
    this.loadedTextures.forEach((tex) => {
      if (tex.dispose) tex.dispose();
    });
    this.loadedTextures.clear();
  }

  dispose() {
    this.clearCache();
    this.loader = null;
  }
}

/**
 * Factory function to create TextureManager
 */
export function createTextureManager(renderer) {
  return new TextureManager(renderer);
}
