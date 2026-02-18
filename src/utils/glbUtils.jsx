import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

/**
 * GLB export utility functions
 */

/**
 * Export model to GLB format and return as Blob
 * @param {THREE.Object3D} model - Model to export
 * @param {Object} options - Export options
 * @returns {Promise<Blob>} - GLB file as Blob
 */
export async function exportModelToGLBBlob(model, options = {}) {
  if (!model) {
    throw new Error("No model provided for export");
  }

  // Clone model to avoid modifying original
  const clonedObject = model.clone(true);

  // Fix materials for GLB compatibility
  clonedObject.traverse((child) => {
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      const newMaterials = [];

      mats.forEach((mat) => {
        let clonedMat = mat.clone();

        // Fix double-sided materials (GLB supports DoubleSide, but we'll keep it as is)
        // No need to convert DoubleSide for GLB as it's well supported

        // Ensure textures are ready
        const textureMaps = [
          "map",
          "normalMap",
          "roughnessMap",
          "metalnessMap",
          "aoMap",
          "emissiveMap",
          "alphaMap",
          "bumpMap",
        ];

        textureMaps.forEach((mapName) => {
          if (clonedMat[mapName]) {
            const texture = clonedMat[mapName];
            texture.needsUpdate = true;
            // GLB uses standard texture orientation (flipY: false)
            texture.flipY = false;
          }
        });

        newMaterials.push(clonedMat);
      });

      if (Array.isArray(child.material)) {
        child.material = newMaterials;
      } else {
        child.material = newMaterials[0] || child.material;
      }
    }
  });

  // Create exporter
  const exporter = new GLTFExporter();
  
  // Export options
  const exportOptions = {
    binary: true, // Export as GLB (binary) instead of GLTF (JSON)
    trs: false, // Use matrix instead of position/rotation/scale
    onlyVisible: false, // Export all objects (we've already filtered)
    ...options,
  };

  return new Promise((resolve, reject) => {
    exporter.parse(
      clonedObject,
      (result) => {
        try {
          if (result instanceof ArrayBuffer || result instanceof Uint8Array) {
            // Binary GLB format
            const blob = new Blob([result], { type: "model/gltf-binary" });
            resolve(blob);
          } else if (typeof result === "object" && result !== null) {
            // JSON GLTF format (shouldn't happen with binary: true, but handle it)
            const jsonString = JSON.stringify(result, null, 2);
            const blob = new Blob([jsonString], { type: "model/gltf+json" });
            resolve(blob);
          } else {
            reject(new Error("Unexpected export result format"));
          }
        } catch (error) {
          reject(new Error(`Failed to process export result: ${error.message}`));
        }
      },
      (error) => {
        reject(new Error(`GLB export failed: ${error.message || "Unknown error"}`));
      },
      exportOptions
    );
  });
}

/**
 * Export model to GLB format and trigger download
 * @param {THREE.Object3D} model - Model to export
 * @param {string} filename - Output filename
 * @param {Object} options - Export options
 * @returns {Promise<void>}
 */
export async function exportModelToGLB(model, filename = "model.glb", options = {}) {
  const blob = await exportModelToGLBBlob(model, options);
  
  // Trigger download
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  
  // Determine filename based on blob type
  if (blob.type === "model/gltf+json") {
    const gltfFilename = filename.endsWith(".gltf") ? filename : filename.replace(".glb", ".gltf");
    link.download = gltfFilename;
  } else {
    link.download = filename.endsWith(".glb") ? filename : `${filename}.glb`;
  }
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
