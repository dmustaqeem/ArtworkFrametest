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
    this.originalModelSize = null; // Store original unscaled model dimensions
    this.baseScaleFactor = 2.5; // Base scale factor used in centerAndScaleModel
    this.currentSizeRatio = null; // Track current size ratio to avoid compounding
    
    // Configure DRACOLoader for Draco-compressed models
    this.dracoLoader = new DRACOLoader();
    // Use local DRACO decoder files from public/assets (no network request needed)
    // This eliminates CDN loading delays and works offline immediately
    this.dracoLoader.setDecoderPath('/assets/draco/gltf/');
    this.loader.setDRACOLoader(this.dracoLoader);
  }

  /**
   * Load GLB model from path, File object, or blob URL
   * @param {string|File|Blob} path - Model path, File object, or blob URL
   * @param {Function} onLoad - Callback when model loads
   * @param {Function} onError - Callback on error
   * @param {Object} sizeRatio - Optional size ratio {widthRatio, heightRatio} for scaling
   */
  loadModel(path, onLoad, onError, sizeRatio = null) {
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
          
          // Center and scale model (with size ratio if provided)
          this.centerAndScaleModel(this.model, 2.5, sizeRatio);
          
          // Update camera and controls (pass sizeRatio to keep camera fixed, showing size difference)
          this.updateCameraAndControls(undefined, sizeRatio);
          
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
          
          // Center and scale model (with size ratio if provided)
          this.centerAndScaleModel(this.model, 2.5, sizeRatio);
          
          // Update camera and controls (pass sizeRatio to keep camera fixed, showing size difference)
          this.updateCameraAndControls(undefined, sizeRatio);
          
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
        
        // Center and scale model (with size ratio if provided)
        this.centerAndScaleModel(this.model, 2.5, sizeRatio);
        
        // Update camera and controls (pass sizeRatio to keep camera fixed, showing size difference)
        this.updateCameraAndControls(undefined, sizeRatio);
        
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
   * @param {THREE.Object3D} model - Model to scale (defaults to this.model)
   * @param {number} scaleFactor - Base scale factor (default: 2.5)
   * @param {Object} sizeRatio - Optional size ratio {widthRatio, heightRatio} to scale model dimensions
   */
  centerAndScaleModel(model = this.model, scaleFactor = 2.5, sizeRatio = null) {
    if (!model) return;

    // Reset scale to 1,1,1 first to ensure clean scaling
    model.scale.set(1, 1, 1);

    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Center model at origin
    model.position.sub(center);

    // Scale to fit
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    let finalScale = scaleFactor / maxDim;

    // Apply size ratio if provided (for custom sizes)
    if (sizeRatio && sizeRatio.widthRatio && sizeRatio.heightRatio) {
      // Scale based on the average ratio to maintain proportions
      // This scales the model to match the desired size dimensions
      const avgRatio = (sizeRatio.widthRatio + sizeRatio.heightRatio) / 2;
      finalScale *= avgRatio;
      
      // Store current size ratio for rescaling
      if (sizeRatio && sizeRatio.widthRatio && sizeRatio.heightRatio) {
        this.currentSizeRatio = {
          widthRatio: sizeRatio.widthRatio,
          heightRatio: sizeRatio.heightRatio,
        };
      } else {
        // If no size ratio provided, assume default (1.0)
        this.currentSizeRatio = {
          widthRatio: 1.0,
          heightRatio: 1.0,
        };
      }
      
    }

    // Apply the scale
    model.scale.multiplyScalar(finalScale);
    

    // Re-center after scaling
    const scaledBox = new THREE.Box3().setFromObject(model);
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    model.position.sub(scaledCenter);

    // Store final bounding box
    this.boundingBox = new THREE.Box3().setFromObject(model);
    
  }

  /**
   * Update camera and controls to focus on model
   * @param {THREE.Vector3} cameraPosition - Optional camera position (default: (0, 0.6, 3.5))
   * @param {Object} sizeRatio - Optional size ratio to adjust camera distance
   */
  updateCameraAndControls(cameraPosition = new THREE.Vector3(0, 0.6, 3.5), sizeRatio = null) {
    if (!this.boundingBox || !this.camera || !this.controls) return;

    const modelCenter = this.boundingBox.getCenter(new THREE.Vector3());
    
    // Update controls target
    this.controls.target.copy(modelCenter);

    // Adjust camera position based on size ratio if provided
    let finalCameraPosition = cameraPosition.clone();
    if (sizeRatio && sizeRatio.widthRatio && sizeRatio.heightRatio) {
      // Scale camera distance based on average size ratio to keep model at similar visual size
      // OR keep camera fixed to see size difference - let's keep it fixed for now
      const avgRatio = (sizeRatio.widthRatio + sizeRatio.heightRatio) / 2;
      // Option 1: Keep camera fixed (model will appear larger/smaller)
      // Don't adjust camera - this allows size changes to be visible
      // Option 2: Adjust camera to maintain visual size (uncomment below)
      // finalCameraPosition.multiplyScalar(1 / avgRatio);
    }

    // Reset camera position
    this.camera.position.copy(finalCameraPosition);
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
   * @param {THREE.Object3D} model - Model to set
   * @param {Object} sizeRatio - Optional size ratio for scaling
   */
  setModel(model, sizeRatio = null) {
    if (this.model && this.model !== model) {
      this.scene.remove(this.model);
    }
    this.model = model;
    if (model) {
      this.centerAndScaleModel(model, 2.5, sizeRatio);
      this.updateCameraAndControls(undefined, sizeRatio);
      this.scene.add(model);
    }
  }

  /**
   * Rescale existing model based on size ratio (without reloading)
   * This preserves rotation, position, and only changes scale proportionally
   * @param {Object} sizeRatio - Size ratio {widthRatio, heightRatio}
   */
  rescaleModel(sizeRatio = null) {
    if (!this.model) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ModelManager] Cannot rescale: model not loaded');
      }
      return;
    }
    
    if (!sizeRatio || !sizeRatio.widthRatio || !sizeRatio.heightRatio) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ModelManager] Cannot rescale: invalid size ratio');
      }
      return;
    }
    
    // Store ALL transform properties BEFORE any operations to preserve them
    const currentPosition = this.model.position.clone();
    const currentRotation = this.model.rotation.clone();
    const currentQuaternion = this.model.quaternion.clone();
    const currentScale = this.model.scale.clone();
    
    // Calculate the ratio change
    const newAvgRatio = (sizeRatio.widthRatio + sizeRatio.heightRatio) / 2;
    
    // Calculate scale multiplier based on previous ratio
    let scaleMultiplier;
    if (this.currentSizeRatio) {
      // We have a previous ratio - calculate relative change
      const oldAvgRatio = (this.currentSizeRatio.widthRatio + this.currentSizeRatio.heightRatio) / 2;
      scaleMultiplier = newAvgRatio / oldAvgRatio;
    } else {
      // First time rescaling - need to figure out what the current ratio is
      // We'll use the stored base scale from centerAndScaleModel
      // The current scale should be: baseScale * oldRatio
      // So: oldRatio = currentScale / baseScale
      // But we need to get baseScale without resetting...
      
      // Actually, we can calculate it from the bounding box and the scale
      // If we know the bounding box size and the scale, we can work backwards
      // But this is complex. Instead, let's assume the model was loaded with ratio 1.0
      // and calculate the base scale from the current state
      
      // Get the model's unscaled bounding box by temporarily resetting scale
      // But we'll restore everything immediately
      this.model.scale.set(1, 1, 1);
      this.model.updateMatrixWorld(true);
      const unscaledBox = new THREE.Box3().setFromObject(this.model);
      const unscaledSize = unscaledBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(unscaledSize.x, unscaledSize.y, unscaledSize.z) || 1;
      const baseScale = this.baseScaleFactor / maxDim;
      
      // Restore everything immediately
      this.model.position.copy(currentPosition);
      this.model.rotation.copy(currentRotation);
      this.model.quaternion.copy(currentQuaternion);
      this.model.scale.copy(currentScale);
      this.model.updateMatrixWorld(true);
      
      // Calculate assumed old ratio
      const currentScaleLength = currentScale.length();
      const assumedOldRatio = currentScaleLength / baseScale;
      
      // Calculate multiplier
      scaleMultiplier = newAvgRatio / assumedOldRatio;
    }
    
    // Apply the scale multiplier directly (this preserves rotation and position)
    this.model.scale.multiplyScalar(scaleMultiplier);
    
    // CRITICAL: Update matrix to ensure rotation is preserved
    this.model.updateMatrixWorld(true);
    
    // Double-check: restore rotation/quaternion if they changed (safety measure)
    if (!this.model.rotation.equals(currentRotation)) {
      this.model.rotation.copy(currentRotation);
    }
    if (!this.model.quaternion.equals(currentQuaternion)) {
      this.model.quaternion.copy(currentQuaternion);
    }
    this.model.updateMatrixWorld(true);
    
    // Update stored size ratio
    this.currentSizeRatio = {
      widthRatio: sizeRatio.widthRatio,
      heightRatio: sizeRatio.heightRatio,
    };
    
    // Update bounding box
    this.boundingBox = new THREE.Box3().setFromObject(this.model);
    
    // Update camera (keep it fixed to show size difference)
    this.updateCameraAndControls(undefined, sizeRatio);
    
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
