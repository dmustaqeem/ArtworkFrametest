import * as THREE from "three";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";

/**
 * USDZ export utility functions
 */

/**
 * Export model to USDZ format
 * @param {THREE.Object3D} model - Model to export
 * @param {string} filename - Output filename
 * @param {Object} options - Export options
 * @returns {Promise<void>}
 */
export async function exportModelToUSDZ(model, filename = "model.usdz", options = {}) {
  if (!model) {
    throw new Error("No model provided for export");
  }

  // Clone model to avoid modifying original
  const clonedObject = model.clone(true);

  // Fix materials for USDZ compatibility
  clonedObject.traverse((child) => {
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      const newMaterials = [];

      mats.forEach((mat) => {
        let clonedMat = mat.clone();

        // Fix double-sided materials
        if (clonedMat.side === THREE.DoubleSide) {
          clonedMat.side = THREE.FrontSide;
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

          standardMat.side = clonedMat.side === THREE.DoubleSide ? THREE.FrontSide : clonedMat.side;
          standardMat.needsUpdate = true;
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

    // Create blob and download
    const blob = new Blob([arrayBuffer], { type: "model/vnd.usdz+zip" });
    if (blob.size === 0) {
      throw new Error("Blob creation failed - file is empty");
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.endsWith(".usdz") ? filename : `${filename}.usdz`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(`USDZ export failed: ${error.message}`);
  }
}
