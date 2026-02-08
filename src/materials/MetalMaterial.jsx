import * as THREE from "three";
import { applyPreset } from "./BaseMaterial.jsx";

/**
 * Metal Material Module
 * Handles metal prints (brushed silver, white, canvas, etc.)
 */

export const METAL_PRESET = {
  PRINT: {
    metalness: 0,
    roughness: 0.25,
    clearcoat: 0,
    clearcoatRoughness: 0,
    envBase: 0.9,
    specularIntensity: 0.12,
    keepMaps: ["map"], // Only keep color map, remove PBR maps
    requiresPhysical: false, // Use StandardMaterial for texture visibility
  },
  METAL: {
    metalness: 1.0,
    roughness: 0.75, // Default to brushed finish (matte) - will be overridden by finish selection
    envBase: 0.3, // Low reflection intensity for minimal reflections
    requiresPhysical: false, // Can use Standard or Physical
  },
  DEFAULT: {
    metalness: 0,
    roughness: 0.85,
    envBase: 0.6,
    requiresPhysical: false,
  },
};

// Metal finish presets
export const METAL_FINISH_PRESETS = {
  polished: { roughness: 0.05 }, // Very smooth, highly reflective, mirror-like
  brushed: { roughness: 0.75 }, // Very matte, minimal reflections, brushed texture
};

/**
 * Classifies a material for metal prints
 */
export const classifyMaterial = ({ meshName, material, materialType }) => {
  const matName = (material?.name || "").toLowerCase();
  const meshNameLower = (meshName || "").toLowerCase();
  
  // METAL: Check metalness OR metalnessMap OR metal-related names
  if (
    materialType === "METAL" ||
    materialType === "METAL_BOX" ||
    (material?.metalness !== undefined && material.metalness > 0.4) ||
    material?.metalnessMap ||
    meshNameLower.includes("metal") ||
    matName.includes("metal") ||
    meshNameLower.includes("frame") ||
    matName.includes("frame") ||
    meshNameLower.includes("aluminium") ||
    matName.includes("aluminium") ||
    meshNameLower.includes("aluminum") ||
    matName.includes("aluminum") ||
    meshNameLower.includes("steel") ||
    matName.includes("steel") ||
    meshNameLower.includes("canvas") ||
    matName.includes("canvas")
  ) {
    return "METAL";
  }
  
  // PRINT: Has color map AND not metal
  const hasArtworkMap = !!material?.map;
  if (hasArtworkMap) {
    return "PRINT";
  }
  
  return "DEFAULT";
};

/**
 * Applies metal material preset
 */
export const applyMetalPreset = (material, preset, renderer, role, options = {}) => {
  // Use BaseMaterial's applyPreset to handle material upgrades and properties
  // BaseMaterial will handle downgrading PhysicalMaterial to StandardMaterial for PRINT if needed
  const updatedMat = applyPreset(material, preset, renderer, role, options);
  
  // For PRINT role (artwork layer), ensure texture is visible
  if (role === "PRINT") {
    // Ensure opaque and no transmission
    updatedMat.transparent = false;
    updatedMat.opacity = 1.0;
    
    // Don't apply transmission to artwork layer (BaseMaterial already handles this, but ensure it)
    if (updatedMat.isMeshPhysicalMaterial) {
      updatedMat.transmission = 0;
      updatedMat.thickness = 0;
      updatedMat.ior = 1.0;
    }
    
    // CRITICAL: Ensure texture map is visible and properly configured
    if (updatedMat.map) {
      updatedMat.map.needsUpdate = true;
    }
  }
  
  return updatedMat;
};

/**
 * Updates metal materials when environment map changes
 */
export const updateMetalMaterials = (model, envMap, showReflections, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        mat.envMap = null; // Use scene.environment
        const baseIntensity = baseEnvMapIntensities.get(mat);
        if (baseIntensity !== undefined) {
          mat.envMapIntensity = baseIntensity * reflectionIntensity;
        }
        mat.needsUpdate = true;
      }
    });
  });
};

/**
 * Updates metal materials when reflection intensity changes
 */
export const updateMetalReflectionIntensity = (model, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        const baseIntensity = baseEnvMapIntensities.get(mat);
        if (baseIntensity !== undefined) {
          mat.envMapIntensity = baseIntensity * reflectionIntensity;
          mat.needsUpdate = true;
        }
      }
    });
  });
};

/**
 * Updates metal materials when metal finish changes
 */
export const updateMetalFinish = (model, metalFinish) => {
  if (!model) return;
  
  const METAL_FINISH_PRESETS = {
    polished: { roughness: 0.05 }, // Very smooth, highly reflective, mirror-like
    brushed: { roughness: 0.75 }, // Very matte, minimal reflections, brushed texture
  };
  
  const finishPreset = METAL_FINISH_PRESETS[metalFinish];
  if (!finishPreset) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        if (mat.metalness !== undefined && mat.metalness > 0.4) {
          mat.roughness = finishPreset.roughness;
          mat.needsUpdate = true;
        }
      }
    });
  });
};

/**
 * Updates metal materials when metal color changes
 * Also updates PRINT role materials (artwork layers) to use metal color
 */
export const updateMetalColor = (model, metalColor) => {
  if (!model) return;
  
  const METAL_COLOR_MAP = {
    brushed_silver: new THREE.Color(0xe8e8f0), // Brushed silver - bright silver with slight blue tint (RGB: 232, 232, 240) for increased brightness
    white: new THREE.Color(0xffffff), // White color
  };
  
  const color = METAL_COLOR_MAP[metalColor];
  if (!color) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        // Update METAL role materials (high metalness)
        if (mat.metalness !== undefined && mat.metalness > 0.4) {
          mat.color.copy(color);
          mat.needsUpdate = true;
        }
        // Also update PRINT role materials (artwork layers with texture maps)
        // This ensures artwork materials have the correct metal color
        if (mat.map) {
          mat.color.copy(color);
          mat.needsUpdate = true;
        }
      }
    });
  });
};

/**
 * Default lighting configuration for metal materials
 * Bright lighting for visibility with minimal reflections
 */
export const DEFAULT_LIGHTING = {
  exposure: 2.5, // Higher exposure for brightness
  ambient: 0.8, // Higher ambient for overall brightness
  key: 2.0, // Stronger key light
  fill: 0.6, // More fill light
  rim: 0.5, // More rim light
};

/**
 * Metal Material Lighting Controls Component
 * Uses LightingManager parent object for lighting state
 */
export const MetalLightingControls = ({ lightingManager, reflectionIntensity, onReflectionIntensityChange, metalFinish, onMetalFinishChange, metalColor, onMetalColorChange }) => {
  // Get current lighting from LightingManager if provided, otherwise use fallback
  const lighting = lightingManager ? lightingManager.getLighting() : { exposure: 2.5, ambient: 0.8, key: 2.0, fill: 0.6, rim: 0.5 };
  
  // Handler to update lighting through LightingManager
  const handleLightingChange = (newLighting) => {
    if (lightingManager) {
      lightingManager.updateLighting(newLighting);
    }
  };
  return (
    <div>
      {/* Metal Color/Finish Control */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3 }}>
            Metal Finish
          </span>
          <span style={{ fontSize: 11, opacity: 0.7 }}>
            {metalColor === "brushed_silver" ? "Brushed Silver" : "Brushed White"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => onMetalColorChange("brushed_silver")}
            style={{
              flex: 1,
              padding: 8,
              border: 0,
              borderRadius: 4,
              background: metalColor === "brushed_silver" ? "#4CAF50" : "#444",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 11,
              transition: "background-color 0.2s",
            }}
          >
            Brushed Silver
          </button>
          <button
            onClick={() => onMetalColorChange("white")}
            style={{
              flex: 1,
              padding: 8,
              border: 0,
              borderRadius: 4,
              background: metalColor === "white" ? "#4CAF50" : "#444",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 11,
              transition: "background-color 0.2s",
            }}
          >
            Brushed White
          </button>
        </div>
        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
          Select metal finish: Brushed Silver or Brushed White
        </div>
      </div>

      {/* Metal Roughness Control */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3 }}>
            Surface Roughness
          </span>
          <span style={{ fontSize: 11, opacity: 0.7, textTransform: "capitalize" }}>
            {metalFinish}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => onMetalFinishChange("polished")}
            style={{
              flex: 1,
              padding: 8,
              border: 0,
              borderRadius: 4,
              background: metalFinish === "polished" ? "#4CAF50" : "#444",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 11,
              transition: "background-color 0.2s",
            }}
          >
            Polished
          </button>
          <button
            onClick={() => onMetalFinishChange("brushed")}
            style={{
              flex: 1,
              padding: 8,
              border: 0,
              borderRadius: 4,
              background: metalFinish === "brushed" ? "#4CAF50" : "#444",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 11,
              transition: "background-color 0.2s",
            }}
          >
            Brushed
          </button>
        </div>
        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
          Adjust metal material roughness (polished = smooth, brushed = rough)
        </div>
      </div>

      {/* Reflection Intensity Control */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3 }}>
            Reflection Intensity
          </span>
          <span style={{ fontSize: 11, opacity: 0.7 }}>
            {(reflectionIntensity * 100).toFixed(0)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={2.0}
          step={0.05}
          value={reflectionIntensity}
          onChange={(e) => onReflectionIntensityChange(parseFloat(e.target.value))}
          style={{ width: "100%" }}
        />
        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
          Control overall reflection strength on metal surface
        </div>
      </div>
    </div>
  );
};
