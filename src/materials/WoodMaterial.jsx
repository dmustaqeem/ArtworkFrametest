import * as THREE from "three";
import { applyPreset } from "./BaseMaterial.jsx";

/**
 * Wood Material Module
 * Handles eco-friendly wood prints from FSC certified sustainable forests
 */

export const WOOD_PRESET = {
  PRINT: {
    metalness: 0,
    roughness: 0.95, // Very matte finish for artwork (almost completely non-reflective)
    clearcoat: 0,
    clearcoatRoughness: 0,
    envBase: 0.05, // Extremely low reflection intensity for matte wood
    specularIntensity: 0.05, // Very low specular for matte finish
    keepMaps: ["map"], // Only keep color map, remove PBR maps
    requiresPhysical: true,
  },
  WOOD: {
    metalness: 0,
    roughness: 0.95, // Very matte, natural wood grain texture (almost completely non-reflective)
    clearcoat: 0, // No clearcoat for matte finish
    clearcoatRoughness: 0,
    envBase: 0.05, // Extremely low reflection intensity for matte wood
    requiresPhysical: false,
  },
  DEFAULT: {
    metalness: 0,
    roughness: 0.95, // Very matte
    envBase: 0.05, // Extremely low reflection intensity
    requiresPhysical: false,
  },
};

/**
 * Classifies a material for wood prints
 */
export const classifyMaterial = ({ meshName, material, materialType }) => {
  const matName = (material?.name || "").toLowerCase();
  const meshNameLower = (meshName || "").toLowerCase();
  
  // WOOD: Check for wood indicators
  if (
    materialType === "WOOD" ||
    meshNameLower.includes("wood") ||
    matName.includes("wood") ||
    meshNameLower.includes("eco") ||
    matName.includes("eco")
  ) {
    return "WOOD";
  }
  
  // PRINT: Has color map
  const hasArtworkMap = !!material?.map;
  if (hasArtworkMap) {
    return "PRINT";
  }
  
  return "DEFAULT";
};

/**
 * Applies wood material preset
 * @param {THREE.Material} material - The material to apply preset to
 * @param {Object} preset - The preset configuration
 * @param {THREE.WebGLRenderer} renderer - The renderer
 * @param {string} role - The material role (PRINT, WOOD, DEFAULT)
 * @param {Object} options - Additional options
 */
export const applyWoodPreset = (material, preset, renderer, role, options = {}) => {
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
    
    // Don't set white color for wood materials - keep original color to show texture without tinting
    // This allows textures on Artwork_FullBleed to display with natural colors
  }
  
  return updatedMat;
};

/**
 * Helper to detect wood back layer meshes (e.g. Wood_Back) that should be bright and matte
 */
const isWoodBackLayer = (obj) => {
  if (!obj || !obj.name) return false;
  const meshName = obj.name.toLowerCase();
  return (
    meshName === "wood_back" ||
    (meshName.includes("wood") && meshName.includes("back"))
  );
};

/**
 * Applies matte and bright settings to Wood_Back materials
 * Matches Mirror_Back approach: bright RGB with tone mapping enabled, mostly matte
 */
const applyWoodBackSettings = (mat) => {
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
    mat.color.setRGB(1.0, 1.0, 1.0); // Bright like mirror back
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
 * Updates wood materials when environment map changes
 */
export const updateWoodMaterials = (model, envMap, showReflections, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    
    // Wood back: force bright + matte + no reflections (like Mirror_Back)
    if (isWoodBackLayer(obj)) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        applyWoodBackSettings(mat);
      });
      return; // IMPORTANT: don't let generic env logic touch it
    }
    
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        mat.envMap = null; // Use scene.environment
        
        // Update environment map intensity
        const baseIntensity = baseEnvMapIntensities.get(mat);
        if (baseIntensity !== undefined) {
          // For wood, ensure very low reflections even with reflection intensity slider
          // Cap the final intensity to keep it matte
          const finalIntensity = Math.min(baseIntensity * reflectionIntensity, 0.1);
          mat.envMapIntensity = finalIntensity;
        }
        
        // Ensure high roughness for matte finish
        if (mat.roughness !== undefined && mat.roughness < 0.9) {
          mat.roughness = 0.95;
        }
        
        // Ensure no clearcoat for matte finish
        if (mat.clearcoat !== undefined && mat.clearcoat > 0) {
          mat.clearcoat = 0;
        }
        
        // Ensure low specular intensity for matte finish
        if (mat.specularIntensity !== undefined && mat.specularIntensity > 0.1) {
          mat.specularIntensity = 0.05;
        }
        
        mat.needsUpdate = true;
      }
    });
  });
};

/**
 * Updates wood materials when reflection intensity changes
 */
export const updateWoodReflectionIntensity = (model, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    
    // Wood back: keep bright + matte + no reflections (like Mirror_Back)
    if (isWoodBackLayer(obj)) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        applyWoodBackSettings(mat);
      });
      return; // IMPORTANT: don't let generic env logic touch it
    }
    
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        const baseIntensity = baseEnvMapIntensities.get(mat);
        if (baseIntensity !== undefined) {
          // For wood, ensure very low reflections even with reflection intensity slider
          // Cap the final intensity to keep it matte
          const finalIntensity = Math.min(baseIntensity * reflectionIntensity, 0.1);
          mat.envMapIntensity = finalIntensity;
        }
        
        // Ensure high roughness for matte finish
        if (mat.roughness !== undefined && mat.roughness < 0.9) {
          mat.roughness = 0.95;
        }
        
        // Ensure no clearcoat for matte finish
        if (mat.clearcoat !== undefined && mat.clearcoat > 0) {
          mat.clearcoat = 0;
        }
        
        // Ensure low specular intensity for matte finish
        if (mat.specularIntensity !== undefined && mat.specularIntensity > 0.1) {
          mat.specularIntensity = 0.05;
        }
        
        mat.needsUpdate = true;
      }
    });
  });
};

/**
 * Default lighting configuration for wood materials
 */
export const DEFAULT_LIGHTING = {
  exposure: 1.5,
  ambient: 0.6, // Slightly higher for natural wood warmth
  key: 1.4,
  fill: 0.3,
  rim: 0.3,
};

/**
 * Wood Material Lighting Controls Component
 * Uses LightingManager parent object for lighting state
 */
export const WoodLightingControls = ({ lightingManager, reflectionIntensity, onReflectionIntensityChange }) => {
  // Get current lighting from LightingManager if provided, otherwise use fallback
  const lighting = lightingManager ? lightingManager.getLighting() : { exposure: 2.0, ambient: 0.6, key: 1.4, fill: 0.3, rim: 0.3 };
  
  // Handler to update lighting through LightingManager
  const handleLightingChange = (newLighting) => {
    if (lightingManager) {
      lightingManager.updateLighting(newLighting);
    }
  };
  return (
    <div>
      {/* Wood-specific controls */}
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
          Control reflection on wood grain surface
        </div>
      </div>
    </div>
  );
};
