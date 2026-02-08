import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

/**
 * ModelManager - Manages GLB model loading, centering, scaling, and positioning
 */
export class ModelManager {
  constructor(scene, camera, controls) {
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.model = null;
    this.boundingBox = null;
    this.loader = new GLTFLoader();
    
    // Configure DRACOLoader for Draco-compressed models
    this.dracoLoader = new DRACOLoader();
    // Use CDN for draco decoder files (works offline after first load)
    // Google's CDN is reliable and caches well
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    // Alternative: Use jsdelivr CDN if Google's CDN is blocked
    // this.dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');
    this.loader.setDRACOLoader(this.dracoLoader);
  }

  /**
   * Load GLB model from path, File object, or blob URL
   */
  loadModel(path, onLoad, onError) {
    // Handle File objects directly - convert to object URL
    if (path instanceof File) {
      const objectUrl = URL.createObjectURL(path);
      // Store URL so we can revoke it later if needed
      this._currentObjectUrl = objectUrl;
      
      this.loader.load(
        objectUrl,
        (gltf) => {
          const model = gltf.scene;
          this.model = model;
          
          // Center and scale model
          this.centerAndScaleModel();
          
          // Update camera and controls
          this.updateCameraAndControls();
          
          // Add to scene
          this.scene.add(model);
          
          // Revoke object URL after loading (textures are already loaded)
          URL.revokeObjectURL(objectUrl);
          this._currentObjectUrl = null;
          
          if (onLoad) {
            onLoad(model, this.boundingBox);
          }
        },
        undefined, // onProgress
        (error) => {
          URL.revokeObjectURL(objectUrl);
          this._currentObjectUrl = null;
          const errorMsg = error?.message || "Failed to load GLB file";
          if (onError) onError(errorMsg);
        }
      );
      return;
    }

    // Handle blob URLs - use directly but ensure they're valid
    if (typeof path === 'string' && path.startsWith('blob:')) {
      this.loader.load(
        path,
        (gltf) => {
          const model = gltf.scene;
          this.model = model;
          
          // Center and scale model
          this.centerAndScaleModel();
          
          // Update camera and controls
          this.updateCameraAndControls();
          
          // Add to scene
          this.scene.add(model);
          
          if (onLoad) {
            onLoad(model, this.boundingBox);
          }
        },
        undefined, // onProgress
        (error) => {
          const errorMsg = error?.message || "Failed to load blob URL";
          if (onError) onError(errorMsg);
        }
      );
      return;
    }

    // Handle regular file paths
    this.loader.load(
      path,
      (gltf) => {
        const model = gltf.scene;
        this.model = model;
        
        // Center and scale model
        this.centerAndScaleModel();
        
        // Update camera and controls
        this.updateCameraAndControls();
        
        // Add to scene
        this.scene.add(model);
        
        if (onLoad) {
          onLoad(model, this.boundingBox);
        }
      },
      undefined, // onProgress
      (error) => {
        const errorMsg = error?.message || "Failed to load GLB";
        if (onError) onError(errorMsg);
      }
    );
  }

  /**
   * Center and scale model to fit view
   */
  centerAndScaleModel(model = this.model, scaleFactor = 2.5) {
    if (!model) return;

    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Center model at origin
    model.position.sub(center);

    // Scale to fit
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    model.scale.multiplyScalar(scaleFactor / maxDim);

    // Re-center after scaling
    const scaledBox = new THREE.Box3().setFromObject(model);
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    model.position.sub(scaledCenter);

    // Store final bounding box
    this.boundingBox = new THREE.Box3().setFromObject(model);
  }

  /**
   * Update camera and controls to focus on model
   */
  updateCameraAndControls(cameraPosition = new THREE.Vector3(0, 0.6, 3.5)) {
    if (!this.boundingBox || !this.camera || !this.controls) return;

    const modelCenter = this.boundingBox.getCenter(new THREE.Vector3());
    
    // Update controls target
    this.controls.target.copy(modelCenter);

    // Reset camera position
    this.camera.position.copy(cameraPosition);
    this.camera.lookAt(modelCenter);
    this.controls.update();
  }

  /**
   * Get current model
   */
  getModel() {
    return this.model;
  }

  /**
   * Get current bounding box
   */
  getBoundingBox() {
    return this.boundingBox;
  }

  /**
   * Set model directly (for external use)
   */
  setModel(model) {
    if (this.model && this.model !== model) {
      this.scene.remove(this.model);
    }
    this.model = model;
    if (model) {
      this.centerAndScaleModel();
      this.updateCameraAndControls();
      this.scene.add(model);
    }
  }

  /**
   * Remove model from scene
   */
  removeModel() {
    if (this.model) {
      this.scene.remove(this.model);
      this.model = null;
      this.boundingBox = null;
    }
  }

  dispose() {
    this.removeModel();
    if (this.dracoLoader) {
      this.dracoLoader.dispose();
      this.dracoLoader = null;
    }
    this.loader = null;
  }
}

/**
 * Factory function to create ModelManager
 */
export function createModelManager(scene, camera, controls) {
  return new ModelManager(scene, camera, controls);
}
