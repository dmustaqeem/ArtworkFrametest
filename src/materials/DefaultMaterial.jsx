import * as THREE from "three";
import { applyPreset } from "./BaseMaterial.jsx";

/**
 * Default Material Module
 * Fallback for unknown material types
 */

export const DEFAULT_PRESET = {
  PRINT: {
    metalness: 0,
    roughness: 0.25,
    clearcoat: 0,
    clearcoatRoughness: 0,
    envBase: 0.9,
    specularIntensity: 0.12,
    keepMaps: ["map"],
    requiresPhysical: true,
  },
  DEFAULT: {
    metalness: 0,
    roughness: 0.85,
    envBase: 0.6,
    requiresPhysical: false,
  },
};

/**
 * Classifies a material (default fallback)
 */
export const classifyMaterial = ({ meshName, material, materialType }) => {
  const hasArtworkMap = !!material?.map;
  if (hasArtworkMap) {
    return "PRINT";
  }
  return "DEFAULT";
};

/**
 * Applies default material preset
 */
export const applyDefaultPreset = (material, preset, renderer, role, options = {}) => {
  return applyPreset(material, preset, renderer, role, options);
};

/**
 * Helper to detect back layer meshes (e.g. Back, Default_Back) that should be bright and matte
 */
const isBackLayer = (obj) => {
  if (!obj || !obj.name) return false;
  const meshName = obj.name.toLowerCase();
  return (
    meshName === "back" ||
    meshName === "default_back" ||
    (meshName.includes("back") && !meshName.includes("artwork"))
  );
};

/**
 * Applies matte and bright settings to Back materials
 * Matches Mirror_Back approach: bright RGB with tone mapping enabled, mostly matte
 */
const applyBackSettings = (mat) => {
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
    mat.color.setRGB(3.0, 3.0, 3.0); // Bright like mirror back
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
 * Updates default materials when environment map changes
 */
export const updateDefaultMaterials = (model, envMap, showReflections, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    
    // Back layer: force bright + matte + no reflections (like Mirror_Back)
    if (isBackLayer(obj)) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        applyBackSettings(mat);
      });
      return; // IMPORTANT: don't let generic env logic touch it
    }
    
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
 * Updates default materials when reflection intensity changes
 */
export const updateDefaultReflectionIntensity = (model, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    
    // Back layer: keep bright + matte + no reflections (like Mirror_Back)
    if (isBackLayer(obj)) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        applyBackSettings(mat);
      });
      return; // IMPORTANT: don't let generic env logic touch it
    }
    
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
 * Default lighting configuration
 */
export const DEFAULT_LIGHTING = {
  exposure: 3.5,
  ambient: 0.5,
  key: 1.5,
  fill: 0.25,
  rim: 0.35,
};

/**
 * Default Material Lighting Controls Component
 * Uses LightingManager parent object for lighting state
 */
export const DefaultLightingControls = ({ lightingManager, reflectionIntensity, onReflectionIntensityChange }) => {
  // Get current lighting from LightingManager if provided, otherwise use fallback
  const lighting = lightingManager ? lightingManager.getLighting() : { exposure: 2.0, ambient: 0.5, key: 1.5, fill: 0.25, rim: 0.35 };
  
  // Handler to update lighting through LightingManager
  const handleLightingChange = (newLighting) => {
    if (lightingManager) {
      lightingManager.updateLighting(newLighting);
    }
  };
  return (
    <div>
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
      </div>
    </div>
  );
};
