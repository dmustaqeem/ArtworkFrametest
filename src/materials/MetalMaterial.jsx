import * as THREE from "three";
import { applyPreset } from "./BaseMaterial.jsx";

/**
 * Metal Material Module
 * Handles metal prints (brushed silver, white, canvas, etc.)
 */

export const METAL_PRESET = {
  PRINT: {
    metalness: 0,
    roughness: 3.0, // Maximum roughness - no reflections at all
    clearcoat: 0,
    clearcoatRoughness: 0,
    envBase: 0.0, // Zero reflection intensity for artwork layer
    specularIntensity: 0.0, // No specular for fully matte finish
    keepMaps: ["map"], // Only keep color map, remove PBR maps
    requiresPhysical: false, // Use StandardMaterial for texture visibility
    renderOrder: 2, // Render on top of metal background (Silver_FullBleed/Shrunk)
  },
  METAL: {
    metalness: 1.0,
    roughness: 3.0, // Maximum roughness for fully matte finish (no reflections)
    envBase: 0.0, // Zero reflection intensity - completely disable reflections
    requiresPhysical: false, // Can use Standard or Physical
    renderOrder: 1, // Render below artwork (PRINT layer)
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
  brushed: { roughness: 3.0 }, // Maximum roughness for fully matte finish
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
    // Enable tone mapping so exposure affects brightness (same clarity as acrylics)
    updatedMat.toneMapped = true;
    
    // Ensure transparent for PNG alpha support
    updatedMat.transparent = true;
    updatedMat.opacity = 1.0;
    updatedMat.alphaTest = 0.001; // Very small alpha test to help with transparency
    
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
    
    // Ensure white base color for artwork (but NO white base texture compositing - unlike acrylics)
    if (updatedMat.color) {
      updatedMat.color.set(0xffffff);
    }
  }
  
  return updatedMat;
};

/**
 * Helper to detect metal back layer meshes (e.g. Metal_Back) that should be bright and matte
 */
const isMetalBackLayer = (obj) => {
  if (!obj || !obj.name) return false;
  const meshName = obj.name.toLowerCase();
  return (
    meshName === "metal_back" ||
    (meshName.includes("metal") && meshName.includes("back"))
  );
};

/**
 * Applies matte and bright settings to Metal_Back materials
 * Matches Mirror_Back approach: bright RGB with tone mapping enabled, mostly matte
 */
const applyMetalBackSettings = (mat) => {
  if (!(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) return;

  // Matte / non-reflective - mostly matte like mirror back
  if ("metalness" in mat) mat.metalness = 0.0;
  if ("roughness" in mat) mat.roughness = 0.8; // Mostly matte (like mirror back, not chalk-flat)
  mat.envMap = null;
  if ("envMapIntensity" in mat) mat.envMapIntensity = 0.0;
  
  // Remove all specular/clearcoat highlights
  if ("clearcoat" in mat) mat.clearcoat = 0.0;
  if ("clearcoatRoughness" in mat) mat.clearcoatRoughness = 1.0;
  if ("specularIntensity" in mat) mat.specularIntensity = 0.0;

  // Bright RGB like mirror back (but keep tone mapping enabled to prevent blowout)
  if (mat.color) {
    mat.color.setRGB(1.0, 1.0, 1.0);
  }

  // CRITICAL: Keep tone mapping enabled - prevents blowout
  mat.toneMapped = true;

  // Remove emissive (mirror back doesn't use emissive, uses bright RGB instead)
  if (mat.emissive) {
    mat.emissive.set(0x000000);
    mat.emissiveIntensity = 0.0;
  }

  // CRITICAL: Remove any transmission/glass properties that might have been set by presets
  if (mat.isMeshPhysicalMaterial) {
    mat.transmission = 0;
    mat.thickness = 0;
    mat.ior = 1.0;
    mat.clearcoat = 0;
    mat.clearcoatRoughness = 1.0;
  }

  mat.needsUpdate = true;
};

/**
 * Updates metal materials when environment map changes
 */
export const updateMetalMaterials = (model, envMap, showReflections, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    
    // Metal back: force bright + matte + no reflections (like Mirror_Back)
    if (isMetalBackLayer(obj)) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        applyMetalBackSettings(mat);
      });
      return; // IMPORTANT: don't let generic env logic touch it
    }
    
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        mat.envMap = null; // Use scene.environment
        const baseIntensity = baseEnvMapIntensities.get(mat);
        if (baseIntensity !== undefined) {
          // Completely disable reflections for metals - set to zero
          mat.envMapIntensity = 0.0;
        }
        
        // Force maximum roughness for ALL materials in metal models - no reflections
        if (mat.roughness !== undefined) {
          mat.roughness = 3.0;
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
    
    // Metal back: keep bright + matte + no reflections (like Mirror_Back)
    if (isMetalBackLayer(obj)) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        applyMetalBackSettings(mat);
      });
      return; // IMPORTANT: don't let generic env logic touch it
    }
    
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        const baseIntensity = baseEnvMapIntensities.get(mat);
        if (baseIntensity !== undefined) {
          // Completely disable reflections for metals - set to zero
          mat.envMapIntensity = 0.0;
        }
        
        // Force maximum roughness for ALL materials in metal models - no reflections
        if (mat.roughness !== undefined) {
          mat.roughness = 3.0;
        }
        
        mat.needsUpdate = true;
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
    brushed: { roughness: 3.0 }, // Maximum roughness for fully matte finish
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
  exposure: 2.0, // Increased exposure for brighter appearance on matte metals
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
