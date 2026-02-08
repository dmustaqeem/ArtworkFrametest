import * as THREE from "three";

/**
 * LightingManager
 * Centralized lighting management system for 3D scene
 * Parent object that handles all lighting operations
 * Can be accessed by GlbTextureSwapTester and material modules
 */
export class LightingManager {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    
    // Light objects
    this.lights = {
      ambient: null,
      key: null,
      fill: null,
      rim: null,
    };
    
    // Current lighting state
    this.lighting = {
      exposure: 2.0,
      ambient: 0.5,
      key: 1.5,
      fill: 0.25,
      rim: 0.35,
    };
    
    // Environment rotation
    this.envRotation = 0;
    
    // Material-specific default lighting configurations
    // Materials register their defaults here
    this.materialDefaults = {};
    
    // Callbacks for when lighting changes (for React state updates)
    this.onLightingChangeCallbacks = [];
    this.onEnvRotationChangeCallbacks = [];
    
    // Initialize lights
    this.initializeLights();
  }
  
  /**
   * Register a callback for lighting changes
   * @param {Function} callback - Callback function that receives new lighting state
   */
  onLightingChange(callback) {
    if (typeof callback === 'function') {
      this.onLightingChangeCallbacks.push(callback);
    }
  }
  
  /**
   * Register a callback for environment rotation changes
   * @param {Function} callback - Callback function that receives new rotation
   */
  onEnvRotationChange(callback) {
    if (typeof callback === 'function') {
      this.onEnvRotationChangeCallbacks.push(callback);
    }
  }
  
  /**
   * Notify all callbacks of lighting change
   */
  notifyLightingChange() {
    this.onLightingChangeCallbacks.forEach(callback => {
      callback(this.getLighting());
    });
  }
  
  /**
   * Notify all callbacks of environment rotation change
   */
  notifyEnvRotationChange() {
    this.onEnvRotationChangeCallbacks.forEach(callback => {
      callback(this.getEnvironmentRotation());
    });
  }
  
  /**
   * Initialize all lights in the scene
   */
  initializeLights() {
    // Ambient light
    this.lights.ambient = new THREE.AmbientLight(0xffffff, this.lighting.ambient);
    this.scene.add(this.lights.ambient);
    
    // Key light (main directional)
    this.lights.key = new THREE.DirectionalLight(0xffffff, this.lighting.key);
    this.lights.key.position.set(6, 8, 6); // WhiteWall-style position
    this.lights.key.castShadow = false; // Shadows disabled
    this.scene.add(this.lights.key);
    
    // Fill light (softens shadows)
    this.lights.fill = new THREE.DirectionalLight(0xffffff, this.lighting.fill);
    this.lights.fill.position.set(-6, 4, -6); // WhiteWall-style position
    this.scene.add(this.lights.fill);
    
    // Rim light (edge readability)
    this.lights.rim = new THREE.DirectionalLight(0xffffff, this.lighting.rim);
    this.lights.rim.position.set(-6, 6, -6);
    this.scene.add(this.lights.rim);
    
    // Set renderer properties
    if (this.renderer) {
      this.renderer.physicallyCorrectLights = true;
      this.renderer.toneMappingExposure = this.lighting.exposure;
    }
  }
  
  /**
   * Update lighting configuration
   * @param {Object} newLighting - New lighting values { exposure, ambient, key, fill, rim }
   */
  updateLighting(newLighting) {
    this.lighting = { ...this.lighting, ...newLighting };
    this.applyLighting();
    this.notifyLightingChange();
  }
  
  /**
   * Set complete lighting configuration
   * @param {Object} lighting - Complete lighting configuration
   */
  setLighting(lighting) {
    this.lighting = { ...lighting };
    this.applyLighting();
    this.notifyLightingChange();
  }
  
  /**
   * Apply current lighting state to lights and renderer
   */
  applyLighting() {
    // Update renderer exposure
    if (this.renderer) {
      this.renderer.toneMappingExposure = this.lighting.exposure;
    }
    
    // Update light intensities
    if (this.lights.ambient) {
      this.lights.ambient.intensity = this.lighting.ambient;
    }
    if (this.lights.key) {
      this.lights.key.intensity = this.lighting.key;
    }
    if (this.lights.fill) {
      this.lights.fill.intensity = this.lighting.fill;
    }
    if (this.lights.rim) {
      this.lights.rim.intensity = this.lighting.rim;
    }
  }
  
  /**
   * Set environment rotation
   * @param {number} rotation - Rotation in degrees
   */
  setEnvironmentRotation(rotation) {
    this.envRotation = rotation;
    if (this.scene) {
      const yaw = THREE.MathUtils.degToRad(rotation || 0);
      this.scene.environmentRotation = new THREE.Euler(0, yaw, 0);
    }
    this.notifyEnvRotationChange();
  }
  
  /**
   * Get current lighting state
   * @returns {Object} Current lighting configuration
   */
  getLighting() {
    return { ...this.lighting };
  }
  
  /**
   * Get environment rotation
   * @returns {number} Current rotation in degrees
   */
  getEnvironmentRotation() {
    return this.envRotation;
  }
  
  /**
   * Register material-specific default lighting
   * Called by material modules to register their custom lighting configurations
   * @param {string} materialType - Material type (e.g., "ACRYLIC", "METAL", "METAL_BOX")
   * @param {Object} defaultLighting - Default lighting configuration
   */
  registerMaterialDefaults(materialType, defaultLighting) {
    this.materialDefaults[materialType] = { ...defaultLighting };
  }
  
  /**
   * Get material-specific default lighting
   * @param {string} materialType - Material type
   * @returns {Object|null} Default lighting configuration or null
   */
  getMaterialDefaults(materialType) {
    return this.materialDefaults[materialType] || null;
  }
  
  /**
   * Apply material-specific default lighting
   * @param {string} materialType - Material type
   */
  applyMaterialDefaults(materialType) {
    if (this.materialDefaults[materialType]) {
      this.setLighting(this.materialDefaults[materialType]);
    }
  }
  
  /**
   * Check if material has registered defaults
   * @param {string} materialType - Material type
   * @returns {boolean} True if defaults are registered
   */
  hasMaterialDefaults(materialType) {
    return !!this.materialDefaults[materialType];
  }
  
  /**
   * Reset to default WhiteWall preset
   */
  resetToDefault() {
    this.setLighting({
      exposure: 1.30,
      ambient: 0.05,
      key: 0.45,
      fill: 0.25,
      rim: 0.35,
    });
    this.setEnvironmentRotation(0);
  }
  
  /**
   * Get light references (for external access if needed)
   * @returns {Object} Light objects
   */
  getLights() {
    return this.lights;
  }
  
  /**
   * Cleanup - remove lights from scene
   */
  dispose() {
    if (this.lights.ambient) {
      this.scene.remove(this.lights.ambient);
      this.lights.ambient.dispose();
    }
    if (this.lights.key) {
      this.scene.remove(this.lights.key);
      this.lights.key.dispose();
    }
    if (this.lights.fill) {
      this.scene.remove(this.lights.fill);
      this.lights.fill.dispose();
    }
    if (this.lights.rim) {
      this.scene.remove(this.lights.rim);
      this.lights.rim.dispose();
    }
  }
}

/**
 * Default lighting presets
 */
export const LIGHTING_PRESETS = {
  WHITEWALL: {
    exposure: 1.30,
    ambient: 0.05,
    key: 0.45,
    fill: 0.25,
    rim: 0.35,
  },
  BRIGHT: {
    exposure: 2.5,
    ambient: 0.8,
    key: 2.0,
    fill: 0.6,
    rim: 0.5,
  },
  BALANCED: {
    exposure: 2.0,
    ambient: 0.5,
    key: 1.5,
    fill: 0.25,
    rim: 0.35,
  },
};

/**
 * Create a LightingManager instance
 * @param {THREE.Scene} scene - Three.js scene
 * @param {THREE.WebGLRenderer} renderer - Three.js renderer
 * @returns {LightingManager} LightingManager instance
 */
export function createLightingManager(scene, renderer) {
  return new LightingManager(scene, renderer);
}
