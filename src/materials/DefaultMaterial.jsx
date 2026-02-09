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
 * Updates default materials when environment map changes
 */
export const updateDefaultMaterials = (model, envMap, showReflections, reflectionIntensity, baseEnvMapIntensities) => {
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
 * Updates default materials when reflection intensity changes
 */
export const updateDefaultReflectionIntensity = (model, reflectionIntensity, baseEnvMapIntensities) => {
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
