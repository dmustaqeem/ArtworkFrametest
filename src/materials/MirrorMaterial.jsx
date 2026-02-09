import * as THREE from "three";
import { applyPreset } from "./BaseMaterial.jsx";

/**
 * Mirror Material Module
 * Handles prints on mirror aluminium composite
 */

export const MIRROR_PRESET = {
  PRINT: {
    metalness: 0,
    roughness: 0.25,
    clearcoat: 0,
    clearcoatRoughness: 0,
    envBase: 0.9,
    specularIntensity: 0.12,
    keepMaps: ["map"], // Only keep color map, remove PBR maps
    requiresPhysical: false, // Use StandardMaterial for texture visibility (consistent with metals and acrylic)
  },
  MIRROR: {
    metalness: 1.0,
    roughness: 0.05, // Very smooth mirror surface
    envBase: 2.0, // High reflection intensity
    requiresPhysical: false,
  },
  DEFAULT: {
    metalness: 0,
    roughness: 0.85,
    envBase: 0.6,
    requiresPhysical: false,
  },
};

/**
 * Classifies a material for mirror prints
 */
export const classifyMaterial = ({ meshName, material, materialType }) => {
  const matName = (material?.name || "").toLowerCase();
  const meshNameLower = (meshName || "").toLowerCase();
  
  // MIRROR: Check for mirror indicators
  if (
    materialType === "MIRROR" ||
    meshNameLower.includes("mirror") ||
    matName.includes("mirror")
  ) {
    return "MIRROR";
  }
  
  // PRINT: Has color map (but mirror shines through)
  const hasArtworkMap = !!material?.map;
  if (hasArtworkMap) {
    return "PRINT";
  }
  
  return "DEFAULT";
};

/**
 * Applies mirror material preset
 * @param {THREE.Material} material - The material to apply preset to
 * @param {Object} preset - The preset configuration
 * @param {THREE.WebGLRenderer} renderer - The renderer
 * @param {string} role - The material role (PRINT, MIRROR, DEFAULT)
 * @param {Object} options - Additional options
 */
export const applyMirrorPreset = (material, preset, renderer, role, options = {}) => {
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
    
    // Ensure white base color for artwork (BaseMaterial already does this, but ensure it)
    if (updatedMat.color) {
      updatedMat.color.set(0xffffff);
    }
  }
  
  return updatedMat;
};

/**
 * Helper function to check if a mesh/material is an artwork layer that should be skipped
 * Artwork layers should ALWAYS maintain their own properties and never be updated by updateMirrorMaterials
 * 
 * We check by mesh name FIRST (most reliable), then by material properties as fallback
 * This is CRITICAL to prevent artwork layers from being overwritten when UI controls trigger re-renders
 * 
 * EXPORTED so MaterialProcessor can use it to skip artwork layers when re-applying presets
 */
export const isArtworkLayer = (obj, mat) => {
  if (!obj || !mat) return false;
  
  const meshName = (obj.name || "").toLowerCase();
  const originalName = obj.name || "";
  
  // PRIMARY CHECK: Always skip artwork meshes by name (most reliable)
  // This catches Artwork_FullBleed, Artwork_Shrunk, etc. regardless of their current material properties
  // Check for exact matches first, then variations
  const isArtworkMesh = (meshName.includes("artwork") || meshName.includes("art_work")) && 
                        (meshName.includes("fullbleed") || meshName.includes("full_bleed") || 
                         meshName.includes("shrunk") || meshName.includes("shrink"));
  
  if (isArtworkMesh) {
    // CRITICAL: Always skip artwork meshes - they should NEVER be updated by updateMirrorMaterials
    // This prevents them from being overwritten when UI controls trigger re-renders or material updates
    return true;
  }
  
  // FALLBACK CHECK: Check if material has matte properties (indicating it's an artwork layer with texture applied)
  // This catches cases where mesh name might not match exactly, but material has been set to matte
  // Only use this as fallback - the name check should catch 99% of cases
  const hasMatteProperties = mat.roughness !== undefined && mat.roughness > 0.9 && 
                             mat.envMapIntensity !== undefined && mat.envMapIntensity < 0.2 && 
                             mat.metalness !== undefined && mat.metalness < 0.1;
  
  if (hasMatteProperties) {
    // Debug: Uncomment to verify fallback check is working
    // console.log(`[MirrorMaterial] SKIPPING by matte properties: ${originalName} (roughness: ${mat.roughness}, envMapIntensity: ${mat.envMapIntensity})`);
    return true;
  }
  
  return false;
};

/**
 * Updates mirror materials when environment map changes
 * SKIPS artwork layers to preserve their matte properties
 */
export const updateMirrorMaterials = (model, envMap, showReflections, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        // SKIP artwork layers - they maintain their own matte properties
        // This is CRITICAL - artwork layers should NEVER be updated by this function
        if (isArtworkLayer(obj, mat)) {
          return; // Skip this material, preserve its properties
        }
        
        mat.envMap = null; // Use scene.environment
        
        // Update envMapIntensity based on base intensity and reflection intensity
        const baseIntensity = baseEnvMapIntensities.get(mat);
        if (baseIntensity !== undefined) {
          mat.envMapIntensity = baseIntensity * reflectionIntensity;
        }
        
        // Use normal white color for mirrors (no golden tint)
        // Only apply color if no texture map is present (to preserve texture colors)
        if (mat.color && !mat.map) {
          mat.color.set(0xffffff);
        }
        
        mat.needsUpdate = true;
      }
    });
  });
};

/**
 * Updates mirror materials when reflection intensity changes
 * SKIPS artwork layers to preserve their matte properties
 */
export const updateMirrorReflectionIntensity = (model, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        // SKIP artwork layers - they maintain their own matte properties
        if (isArtworkLayer(obj, mat)) {
          return; // Skip this material, preserve its properties
        }
        
        // Update envMapIntensity based on base intensity and reflection intensity
        const baseIntensity = baseEnvMapIntensities.get(mat);
        if (baseIntensity !== undefined) {
          mat.envMapIntensity = baseIntensity * reflectionIntensity;
        }
        
        // Use normal white color for mirrors (no golden tint)
        // Only apply color if no texture map is present (to preserve texture colors)
        if (mat.color && !mat.map) {
          mat.color.set(0xffffff);
        }
        
        mat.needsUpdate = true;
      }
    });
  });
};

/**
 * Default lighting configuration for mirror materials
 */
export const DEFAULT_LIGHTING = {
  exposure: 0.5, // Unified higher exposure default
  ambient: 0.4,
  key: 1.8,
  fill: 0.2,
  rim: 0.4,
};

/**
 * Mirror Material Lighting Controls Component
 * Uses LightingManager parent object for lighting state
 */
export const MirrorLightingControls = ({ 
  lightingManager, 
  reflectionIntensity, 
  onReflectionIntensityChange
}) => {
  // Get current lighting from LightingManager if provided, otherwise use fallback
  const lighting = lightingManager ? lightingManager.getLighting() : { exposure: 2.2, ambient: 0.4, key: 1.8, fill: 0.2, rim: 0.4 };
  
  // Handler to update lighting through LightingManager
  const handleLightingChange = (newLighting) => {
    if (lightingManager) {
      lightingManager.updateLighting(newLighting);
    }
  };
  return (
    <div>
      {/* Mirror-specific controls */}
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
          max={2.5}
          step={0.05}
          value={reflectionIntensity}
          onChange={(e) => onReflectionIntensityChange(parseFloat(e.target.value))}
          style={{ width: "100%" }}
        />
        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
          Control mirror reflection strength (higher = more reflective)
        </div>
      </div>
      
    </div>
  );
};
