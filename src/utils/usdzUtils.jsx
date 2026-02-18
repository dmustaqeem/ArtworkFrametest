import * as THREE from "three";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";

/**
 * USDZ export utility functions
 */

/**
 * Export model to USDZ format and return as Blob
 * @param {THREE.Object3D} model - Model to export
 * @param {Object} options - Export options
 * @returns {Promise<Blob>} - USDZ file as Blob
 */
export async function exportModelToUSDZBlob(model, options = {}) {
  if (!model) {
    throw new Error("No model provided for export");
  }

  // Clone model to avoid modifying original
  const clonedObject = model.clone(true);

  // Fix materials for USDZ compatibility (same logic as before)
  clonedObject.traverse((child) => {
    if (child.isMesh && child.material) {
      // Special handling for acrylic emissive base layers - adjust position and scale to prevent z-fighting in USDZ
      if (child.userData && child.userData.isAcrylicEmissiveBase) {
        // Multiple strategies to prevent z-fighting in USDZ:
        // 1. Move the base layer significantly back
        // 2. Scale it slightly smaller to reduce exact overlap
        // This only affects the cloned model for export, not the original web view
        if (child.geometry) {
          // Get bounding box to determine size
          const box = new THREE.Box3().setFromObject(child);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          
          // Strategy 1: Use a larger offset for USDZ to prevent z-fighting
          // USDZ has different depth precision, so we need more separation
          const relativeOffset = maxDim * 0.003; // Even larger offset (0.3% of model size) for USDZ
          
          // Calculate the normal direction from the parent mesh
          // For artwork meshes, they're typically on the XY plane with normal in Z direction
          // Move the base layer back in the negative Z direction (behind the artwork)
          if (child.parent) {
            // Get parent's world matrix to determine orientation
            child.parent.updateMatrixWorld(true);
            const parentMatrix = child.parent.matrixWorld;
            
            // Extract Z-axis from parent's rotation (this is the normal direction)
            const zAxis = new THREE.Vector3(0, 0, 1);
            zAxis.applyMatrix4(parentMatrix);
            zAxis.normalize();
            
            // Move back along the normal (more aggressively for USDZ)
            child.position.addScaledVector(zAxis, -relativeOffset);
          } else {
            // Fallback: move back in local Z direction
            child.position.z -= relativeOffset;
          }
          
          // Strategy 2: Scale the base layer slightly smaller (99.5%) to reduce exact overlap
          // This helps prevent z-fighting by ensuring edges don't align exactly
          child.scale.multiplyScalar(0.995);
        }
      }
      
      // Also handle artwork meshes - ensure they write depth properly to prevent z-fighting
      // Check if this is an artwork mesh (parent of acrylic base layer)
      if (child.children && child.children.some(c => c.userData?.isAcrylicEmissiveBase)) {
        // This is an artwork mesh with a base layer child
        // Ensure artwork mesh writes depth and renders after base layer
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((mat) => {
            if (mat) {
              mat.depthWrite = true;
              mat.depthTest = true;
              // Ensure artwork renders after base layer
              if (child.renderOrder === undefined || child.renderOrder < 0) {
                child.renderOrder = 0;
              }
            }
          });
        }
      }

      const mats = Array.isArray(child.material) ? child.material : [child.material];
      const newMaterials = [];

      mats.forEach((mat) => {
        let clonedMat = mat.clone();

        // Special handling for acrylic emissive base layers
        // Convert them to standard white materials instead of high-emissive materials
        // This preserves the white backing while avoiding USDZ glitches
        if (child.userData && child.userData.isAcrylicEmissiveBase) {
          // Convert to a standard white material for USDZ compatibility
          // Use a slightly brighter white to compensate for lack of emissive
          const whiteMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(1.1, 1.1, 1.1), // Slightly brighter than pure white to compensate
            emissive: new THREE.Color(0.3, 0.3, 0.3), // Low emissive for subtle glow (USDZ compatible)
            emissiveIntensity: 0.5, // Low intensity that USDZ can handle
            roughness: 1.0, // Matte
            metalness: 0.0, // Non-metallic
            side: clonedMat.side === THREE.DoubleSide ? THREE.FrontSide : clonedMat.side,
            transparent: false,
            opacity: 1.0,
            depthWrite: true, // Write depth so it's behind artwork
            depthTest: true,
            // Aggressive polygon offset to push it further back and prevent z-fighting in USDZ
            polygonOffset: true,
            polygonOffsetFactor: 10, // Much higher for USDZ to ensure separation
            polygonOffsetUnits: 10, // Much higher for USDZ
          });
          
          // Also set render order to ensure base layer renders first
          child.renderOrder = -1;
          whiteMat.needsUpdate = true;
          clonedMat = whiteMat;
        } else {
          // Fix double-sided materials
          if (clonedMat.side === THREE.DoubleSide) {
            clonedMat.side = THREE.FrontSide;
          }

          // Fix emissive materials for USDZ - reduce high emissive intensity
          // High emissive can cause white glitches in USDZ
          if (clonedMat.emissiveIntensity && clonedMat.emissiveIntensity > 1.0) {
            // Reduce emissive intensity for USDZ compatibility
            clonedMat.emissiveIntensity = Math.min(1.0, clonedMat.emissiveIntensity * 0.3);
          }
        }

        // Convert transmission-based materials to opacity-based
        if (clonedMat.isMeshPhysicalMaterial && clonedMat.transmission > 0) {
          const standardMat = new THREE.MeshStandardMaterial();
          standardMat.color = clonedMat.color?.clone() || new THREE.Color(0xffffff);
          standardMat.roughness = clonedMat.roughness ?? 0.5;
          standardMat.metalness = clonedMat.metalness ?? 0.0;
          standardMat.transparent = true;
          standardMat.opacity = Math.max(0.2, 1.0 - clonedMat.transmission);

          // Copy textures
          if (clonedMat.map) standardMat.map = clonedMat.map;
          if (clonedMat.normalMap) standardMat.normalMap = clonedMat.normalMap;
          if (clonedMat.roughnessMap) standardMat.roughnessMap = clonedMat.roughnessMap;
          if (clonedMat.metalnessMap) standardMat.metalnessMap = clonedMat.metalnessMap;
          if (clonedMat.aoMap) standardMat.aoMap = clonedMat.aoMap;
          if (clonedMat.emissiveMap) standardMat.emissiveMap = clonedMat.emissiveMap;
          if (clonedMat.alphaMap) standardMat.alphaMap = clonedMat.alphaMap;
          if (clonedMat.bumpMap) standardMat.bumpMap = clonedMat.bumpMap;

          clonedMat = standardMat;
        }

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
  const exporter = new USDZExporter();
  let arrayBuffer;

  try {
    if (typeof exporter.parseAsync === "function") {
      arrayBuffer = await exporter.parseAsync(clonedObject);
    } else if (typeof exporter.parse === "function") {
      const result = exporter.parse(clonedObject);
      if (result instanceof Promise) {
        arrayBuffer = await result;
      } else if (result instanceof ArrayBuffer || result instanceof Uint8Array) {
        arrayBuffer = result;
      } else if (typeof result === "string" && result.startsWith("data:")) {
        const response = await fetch(result);
        arrayBuffer = await response.arrayBuffer();
      } else {
        throw new Error("Unexpected result from parse");
      }
    } else {
      throw new Error("USDZExporter does not have parse or parseAsync method");
    }

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Export returned empty result");
    }

    // Validate ZIP signature
    const view = new Uint8Array(arrayBuffer);
    const zipSignature = view[0] === 0x50 && view[1] === 0x4b;
    if (!zipSignature && arrayBuffer.byteLength > 0) {
      throw new Error("USDZ export failed: File is not a valid ZIP format");
    }

    // Create and return blob
    const blob = new Blob([arrayBuffer], { type: "model/vnd.usdz+zip" });
    if (blob.size === 0) {
      throw new Error("Blob creation failed - file is empty");
    }

    return blob;
  } catch (error) {
    throw new Error(`USDZ export failed: ${error.message}`);
  }
}

/**
 * Export model to USDZ format and trigger download
 * @param {THREE.Object3D} model - Model to export
 * @param {string} filename - Output filename
 * @param {Object} options - Export options
 * @returns {Promise<void>}
 */
export async function exportModelToUSDZ(model, filename = "model.usdz", options = {}) {
  const blob = await exportModelToUSDZBlob(model, options);
  
  // Trigger download
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".usdz") ? filename : `${filename}.usdz`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
