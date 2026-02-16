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
   * @param {string} path - Texture path
   * @param {Function} onLoad - Callback when loaded
   * @param {Function} onError - Callback on error
   * @param {Object} options - Options (crisp, maxAnisotropy)
   */
  loadTexture(path, onLoad, onError, options = {}) {
    // Check cache
    if (this.loadedTextures.has(path)) {
      const cachedTex = this.loadedTextures.get(path);
      // Apply crisp settings if requested
      if (options.crisp && cachedTex) {
        this.applyCrispSettings(cachedTex, options.maxAnisotropy);
      }
      if (onLoad) onLoad(cachedTex);
      return cachedTex;
    }

    this.loader.load(
      path,
      (tex) => {
        // ✅ Set sRGB color space at source to preserve vibrant colors
        tex.colorSpace = THREE.SRGBColorSpace;
        
        // Apply crisp settings if requested
        if (options.crisp) {
          this.applyCrispSettings(tex, options.maxAnisotropy);
        }
        
        tex.needsUpdate = true;
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
   * Apply crisp texture settings to an existing texture
   * @param {THREE.Texture} tex - Texture to make crisp
   * @param {Object} options - Options
   *   - useMipmaps: boolean - Enable mipmaps (default: false for close-up artwork)
   *   - maxAnisotropy: number - Maximum anisotropy level (default: 16)
   *   - useRepeatWrapping: boolean - Use RepeatWrapping (default: false)
   */
  applyCrispSettings(tex, options = {}) {
    if (!tex) return;
    
    const useMipmaps = options.useMipmaps !== undefined ? options.useMipmaps : false;
    const maxAnisotropy = options.maxAnisotropy || 16;
    const useRepeatWrapping = options.useRepeatWrapping === true;
    
    tex.generateMipmaps = useMipmaps;
    tex.minFilter = useMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    
    // Set wrapping if requested
    if (useRepeatWrapping) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
    }
    
    // Set anisotropy if renderer is available
    if (this.renderer?.capabilities) {
      tex.anisotropy = Math.min(
        maxAnisotropy,
        this.renderer.capabilities.getMaxAnisotropy()
      );
    }
    
    // Ensure color space is set
    if (!tex.colorSpace) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    
    tex.needsUpdate = true;
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
   * Check if a number is power-of-two
   * @param {number} v - Number to check
   * @returns {boolean} True if power-of-two
   */
  static isPowerOfTwo(v) {
    return v > 0 && (v & (v - 1)) === 0;
  }

  /**
   * Create texture from image/canvas - UNIFIED texture creation path
   * @param {HTMLImageElement|HTMLCanvasElement} image - Source image
   * @param {Object} options - Options
   *   - flipY: boolean - Flip texture vertically
   *   - colorSpace: string - Color space (default: SRGBColorSpace)
   *   - crisp: boolean - If true, enables crisp settings (default: false)
   *   - useMipmaps: boolean - Enable mipmaps (default: auto-detect based on POT)
   *   - useRepeatWrapping: boolean - Use RepeatWrapping instead of ClampToEdge (default: false)
   *   - maxAnisotropy: number - Max anisotropy level (default: 16)
   *   - premultiplyAlpha: boolean - Premultiply alpha (default: true for crisp textures)
   */
  createTextureFromImage(image, options = {}) {
    // Create texture directly
    const tex = new THREE.Texture(image);
    
    // Get actual image dimensions
    const w = image?.naturalWidth || image?.width || 0;
    const h = image?.naturalHeight || image?.height || 0;
    const isPOT = w > 0 && h > 0 && TextureManager.isPowerOfTwo(w) && TextureManager.isPowerOfTwo(h);
    
    // Default settings (backward compatible)
    const useCrisp = options.crisp === true;
    const useRepeatWrapping = options.useRepeatWrapping === true;
    
    // CRITICAL: Only enable mipmaps for power-of-two textures
    // NPOT textures with mipmaps can cause resampling/blur issues in WebGL
    const useMipmaps = options.useMipmaps !== undefined 
      ? options.useMipmaps 
      : (useCrisp ? isPOT : false); // Auto-detect: only use mipmaps for POT if crisp
    
    // Wrapping: RepeatWrapping if using offset/repeat UI, otherwise ClampToEdge
    tex.wrapS = useRepeatWrapping ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.wrapT = useRepeatWrapping ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    
    if (useCrisp) {
      // Crisp settings: mipmaps only for POT textures, otherwise LinearFilter
      tex.generateMipmaps = useMipmaps;
      tex.minFilter = useMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      
      // Enable anisotropy for better quality at oblique angles
      if (this.renderer?.capabilities) {
        tex.anisotropy = Math.min(
          options.maxAnisotropy || 16,
          this.renderer.capabilities.getMaxAnisotropy()
        );
      }
      
      // Premultiply alpha to prevent edge halos when compositing over white
      tex.premultiplyAlpha = options.premultiplyAlpha !== undefined ? options.premultiplyAlpha : true;
    } else {
      // Fast settings: no mipmaps (backward compatible)
      tex.generateMipmaps = useMipmaps;
      tex.minFilter = useMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.premultiplyAlpha = false;
    }
    
    // Always set color space and flipY consistently
    tex.colorSpace = options.colorSpace || THREE.SRGBColorSpace;
    tex.flipY = options.flipY !== undefined ? options.flipY : false;
    
    // Don't force format/type - let Three.js decide based on source
    // This prevents unintended conversions and gamma issues
    
    tex.needsUpdate = true;                   // Mark for GPU update
    
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
