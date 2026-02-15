import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

/**
 * EnvironmentManager - Manages HDRI environment maps and PMREM generation
 */
export class EnvironmentManager {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.pmremGenerator = null;
    this.envMap = null;
    this.hdrTexture = null;
    this.environmentRotation = 0;
    this.isEnabled = true;
    this.currentHDRIPath = null; // Track current HDRI path to avoid reloading
    this.preloadedHDRIs = new Map(); // Cache for preloaded HDRIs (path -> envMap)

    this.initialize();
  }

  initialize() {
    // PMREMGenerator for environment mapping
    if (!this.renderer) {
      console.error("EnvironmentManager: renderer is null, cannot create PMREMGenerator");
      return;
    }
    
    // Ensure renderer is fully initialized
    if (!this.renderer.getContext) {
      console.error("EnvironmentManager: renderer is not fully initialized");
      return;
    }
    
    try {
      this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      if (this.pmremGenerator && typeof this.pmremGenerator.compileEquirectangularShader === 'function') {
        this.pmremGenerator.compileEquirectangularShader();
      }
    } catch (error) {
      console.error("EnvironmentManager: Failed to create PMREMGenerator:", error);
      this.pmremGenerator = null;
    }
  }

  /**
   * Preload an HDRI file in the background (useful for mirror HDRI)
   * This allows the HDRI to be ready when needed, avoiding loading delays
   * Unlike loadHDRI, this doesn't set it as the active environment map
   */
  preloadHDRI(path, onLoad, onError) {
    // Check if already preloaded
    let pathKey = null;
    if (path instanceof File) {
      pathKey = `file:${path.name}`;
    } else if (typeof path === 'string') {
      pathKey = path;
    }
    
    if (pathKey && this.preloadedHDRIs.has(pathKey)) {
      if (onLoad) onLoad(this.preloadedHDRIs.get(pathKey));
      return;
    }
    
    // Ensure PMREMGenerator is initialized
    if (!this.ensurePMREMGeneratorReady()) {
      if (onError) onError("PMREMGenerator is not initialized. Renderer may not be ready.");
      return;
    }
    
    const pmremGenerator = this.pmremGenerator;
    const renderer = this.renderer;
    
    if (!renderer || !renderer.getContext) {
      if (onError) onError("Renderer is not available for HDRI processing");
      return;
    }
    
    const loader = new RGBELoader().setDataType(THREE.HalfFloatType);
    let objectUrl = null;
    let finalPath = path;
    const capturedPathKey = pathKey;
    
    if (path instanceof File) {
      objectUrl = URL.createObjectURL(path);
      finalPath = objectUrl;
    } else if (typeof path === 'string' && path.startsWith('blob:')) {
      finalPath = path;
    }
    
    // Load and process HDRI without setting it as active environment
    loader.load(
      finalPath,
      (hdrTex) => {
        if (!hdrTex || !hdrTex.image) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          if (onError) onError("HDRI file loaded but texture is invalid");
          return;
        }
        
        const activePMREM = this.pmremGenerator || pmremGenerator;
        if (!activePMREM) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          if (onError) onError("PMREMGenerator is not available");
          hdrTex.dispose();
          return;
        }
        
        // Process PMREM in background (yield to browser)
        const processPMREM = () => {
          try {
            const newEnvMap = activePMREM.fromEquirectangular(hdrTex).texture;
            hdrTex.dispose();
            
            // Cache the preloaded environment map
            if (capturedPathKey) {
              this.preloadedHDRIs.set(capturedPathKey, newEnvMap);
            }
            
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            if (onLoad) onLoad(newEnvMap);
          } catch (err) {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            if (onError) onError(`Failed to process HDRI: ${err.message}`);
            hdrTex.dispose();
          }
        };
        
        // Use requestAnimationFrame to yield to browser
        requestAnimationFrame(processPMREM);
      },
      undefined, // onProgress
      (error) => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        const errorMsg = path instanceof File 
          ? `Failed to load HDRI file: ${path.name}`
          : `Failed to load HDRI: ${path}`;
        if (onError) onError(errorMsg);
      }
    );
  }

  /**
   * Load HDRI environment map from path, File object, or blob URL
   */
  loadHDRI(path, onLoad, onError) {
    // Check if we're already loading/loaded the same HDRI
    // For File objects, compare by name; for paths, compare by string
    let pathKey = null;
    if (path instanceof File) {
      pathKey = `file:${path.name}`;
    } else if (typeof path === 'string') {
      pathKey = path;
    }
    
    // Check preloaded cache first
    if (pathKey && this.preloadedHDRIs.has(pathKey)) {
      const preloadedEnvMap = this.preloadedHDRIs.get(pathKey);
      this.setEnvironmentMap(preloadedEnvMap);
      this.currentHDRIPath = pathKey;
      if (onLoad) onLoad(preloadedEnvMap);
      return;
    }
    
    // If we already have this HDRI loaded, skip reloading
    if (pathKey && this.currentHDRIPath === pathKey && this.envMap) {
      if (onLoad) onLoad(this.envMap);
      return;
    }
    
    // Ensure PMREMGenerator is initialized and ready
    if (!this.ensurePMREMGeneratorReady()) {
      const error = "PMREMGenerator is not initialized. Renderer may not be ready.";
      if (onError) onError(error);
      return;
    }
    
    // Capture references to ensure they're available in async callback
    const pmremGenerator = this.pmremGenerator;
    const renderer = this.renderer;
    
    // Verify renderer is still valid
    if (!renderer || !renderer.getContext) {
      const error = "Renderer is not available for HDRI processing";
      if (onError) onError(error);
      return;
    }
    
    const loader = new RGBELoader().setDataType(THREE.HalfFloatType);
    
    // Handle File objects directly - convert to object URL
    let objectUrl = null;
    let finalPath = path;
    const capturedPathKey = pathKey; // Capture pathKey for use in callback
    
    if (path instanceof File) {
      objectUrl = URL.createObjectURL(path);
      finalPath = objectUrl;
    }
    // Handle blob URLs - use directly
    else if (typeof path === 'string' && path.startsWith('blob:')) {
      finalPath = path;
    }
    
    loader.load(
      finalPath,
      (hdrTex) => {
        if (!hdrTex || !hdrTex.image) {
          const error = "HDRI file loaded but texture is invalid";
          if (onError) onError(error);
          return;
        }

        // Re-check PMREMGenerator and renderer are still available
        // Try to ensure PMREMGenerator is ready
        if (!this.ensurePMREMGeneratorReady()) {
          // If we can't re-initialize, try using captured reference
          if (!pmremGenerator) {
            const error = "PMREMGenerator became unavailable during HDRI processing. Renderer may have been disposed.";
            if (onError) onError(error);
            hdrTex.dispose();
            return;
          }
        }

        // Use current PMREMGenerator if available, otherwise use captured reference
        const activePMREM = this.pmremGenerator || pmremGenerator;
        
        if (!activePMREM) {
          const error = "PMREMGenerator is not available";
          if (onError) onError(error);
          hdrTex.dispose();
          return;
        }
        
        // Verify the PMREMGenerator is still functional
        if (typeof activePMREM.fromEquirectangular !== 'function') {
          const error = "PMREMGenerator.fromEquirectangular is not a function";
          if (onError) onError(error);
          hdrTex.dispose();
          return;
        }

        // PMREM generation is CPU-intensive - yield to browser before processing
        // Use requestAnimationFrame to allow browser to render first frame
        const processPMREM = () => {
          try {
            const newEnvMap = activePMREM.fromEquirectangular(hdrTex).texture;
            
            // Dispose old textures
            if (this.hdrTexture) {
              this.hdrTexture.dispose();
            }
            hdrTex.dispose();
            
            // Set new environment map
            this.setEnvironmentMap(newEnvMap);
            
            // Track the current HDRI path to avoid reloading
            if (capturedPathKey) {
              this.currentHDRIPath = capturedPathKey;
            }
            
            // Revoke object URL after loading if we created one
            if (objectUrl) {
              URL.revokeObjectURL(objectUrl);
            }
            
            if (onLoad) onLoad(newEnvMap);
          } catch (err) {
            // Revoke object URL on error
            if (objectUrl) {
              URL.revokeObjectURL(objectUrl);
            }
            const error = `Failed to process HDRI: ${err.message}`;
            if (onError) onError(error);
            hdrTex.dispose();
          }
        };
        
        // Use requestAnimationFrame to yield to browser before PMREM generation
        // This prevents blocking the main thread during setup and allows first render
        requestAnimationFrame(processPMREM);
      },
      undefined, // onProgress
      (error) => {
        // Revoke object URL on error
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
        const errorMsg = path instanceof File 
          ? `Failed to load HDRI file: ${path.name}`
          : `Failed to load HDRI: ${path}. Please check that the file exists in public/assets/hdr/ and restart the dev server.`;
        if (onError) onError(errorMsg);
      }
    );
  }

  /**
   * Set environment map directly
   */
  setEnvironmentMap(envMap) {
    if (this.envMap && this.envMap !== envMap) {
      try {
        this.envMap.dispose();
      } catch {
        // ignore disposal errors
      }
    }

    this.envMap = envMap;
    this.updateSceneEnvironment();
  }

  /**
   * Update scene environment based on enabled state
   */
  updateSceneEnvironment() {
    if (this.scene) {
      this.scene.environment = this.isEnabled ? this.envMap : null;
      
      // Apply rotation if environment map exists
      if (this.isEnabled && this.envMap) {
        this.applyRotation();
      }
    }
  }

  /**
   * Enable or disable environment map
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    this.updateSceneEnvironment();
  }

  /**
   * Set environment rotation (Y axis)
   */
  setEnvironmentRotation(rotation) {
    this.environmentRotation = rotation;
    this.applyRotation();
  }

  /**
   * Apply rotation to scene environment
   */
  applyRotation() {
    if (this.scene && this.envMap) {
      const yaw = THREE.MathUtils.degToRad(this.environmentRotation || 0);
      this.scene.environmentRotation = new THREE.Euler(0, yaw, 0);
    }
  }

  /**
   * Get current environment map
   */
  getEnvironmentMap() {
    return this.envMap;
  }

  /**
   * Get current environment rotation
   */
  getEnvironmentRotation() {
    return this.environmentRotation;
  }

  /**
   * Get PMREM generator (for external use)
   * Will attempt to re-initialize if not available
   */
  getPMREMGenerator() {
    if (!this.pmremGenerator && this.renderer && this.renderer.getContext) {
      // Try to re-initialize if renderer is available
      this.initialize();
    }
    return this.pmremGenerator;
  }

  /**
   * Ensure PMREMGenerator is initialized and ready
   * Returns true if ready, false otherwise
   */
  ensurePMREMGeneratorReady() {
    if (this.pmremGenerator) {
      return true;
    }
    
    if (!this.renderer || !this.renderer.getContext) {
      return false;
    }
    
    this.initialize();
    return !!this.pmremGenerator;
  }

  /**
   * Check if environment is enabled
   */
  isEnvironmentEnabled() {
    return this.isEnabled;
  }

  dispose() {
    if (this.hdrTexture) {
      this.hdrTexture.dispose();
      this.hdrTexture = null;
    }

    if (this.envMap) {
      this.envMap.dispose();
      this.envMap = null;
    }

    if (this.pmremGenerator) {
      this.pmremGenerator.dispose();
      this.pmremGenerator = null;
    }

    if (this.scene) {
      this.scene.environment = null;
    }
  }
}

/**
 * Factory function to create EnvironmentManager
 */
export function createEnvironmentManager(scene, renderer) {
  return new EnvironmentManager(scene, renderer);
}
