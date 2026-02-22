import * as THREE from "three";
import { applyPreset } from "./BaseMaterial.jsx";

/**
 * Mirror Material Module
 * Handles prints on mirror aluminium composite
 */

export const MIRROR_PRESET = {
  PRINT: {
    metalness: 0.0,
    roughness: 0.95, // Very matte (high roughness = less reflective)
    envBase: 0.1, // Very low environment map intensity (minimal reflection)
    specularIntensity: 0.0, // Keep matte
    clearcoat: 0.0,
    clearcoatRoughness: 1.0,
    requiresPhysical: false,
    keepMaps: ["map"], // keep only artwork map

    // ✅ render policy (centralize it here)
    render: {
      transparent: true,
      opacity: 1.0,
      alphaTest: 0.01, // Small alpha test to help with transparency
      depthWrite: false, // Important for transparency rendering
      depthTest: true,
      side: "DoubleSide",
      toneMapped: true,
      colorRGB: [3.0, 3.0, 3.0], // Slightly "hotter" than pure white
    },
  },
  MIRROR: {
    metalness: 1.0,
    roughness: 0.05, // Very smooth mirror surface
    envBase: 2.0, // High reflection intensity
    requiresPhysical: false,
  },
  BACK: {
    // Mirror back layer preset (explicit instead of hardcoding in update functions)
    metalness: 0.0,
    roughness: 0.8, // Keep mostly matte, but not chalk-flat
    envBase: 0.0,
    specularIntensity: 0.0,
    clearcoat: 0.0,
    clearcoatRoughness: 1.0,
    requiresPhysical: false,
    render: {
      toneMapped: true,
      colorRGB: [3.0, 3.0, 3.0], // Bright like mirror back
      transparent: false,
      depthWrite: true,
    },
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
 * Centralized role detection for mirror materials
 * Single source of truth - no fallback based on material properties
 * @param {THREE.Object3D} obj - The mesh object
 * @param {THREE.Material} mat - The material
 * @returns {string} - Role: "PRINT", "BACK", or "MIRROR"
 */
export const getMirrorRole = (obj, mat) => {
  if (!obj || !mat) return "MIRROR";

  const name = (obj?.name || "").toLowerCase();

  // BACK: Mirror back layer
  if (name.includes("mirror") && name.includes("back")) {
    return "BACK";
  }

  // PRINT: Artwork layers
  if (name.includes("artwork") && 
      (name.includes("fullbleed") || name.includes("full_bleed") || 
       name.includes("shrunk") || name.includes("shrink"))) {
    return "PRINT";
  }

  // PRINT fallback: if it has a map AND it's not a mirror surface mesh, treat as PRINT
  if (!!mat?.map && 
      !name.includes("mirror_fullbleed") && 
      !name.includes("mirror_shrunk") &&
      !name.includes("mirror")) {
    return "PRINT";
  }

  // Default: MIRROR
  return "MIRROR";
};

/**
 * Applies render policy from preset to material
 * Centralizes all render flags (transparency, depth, side, color, etc.)
 * @param {THREE.Material} mat - The material to modify
 * @param {Object} render - Render policy object
 */
const applyRenderPolicy = (mat, render) => {
  if (!render || !mat) return;

  if (render.colorRGB && mat.color) {
    mat.color.setRGB(render.colorRGB[0], render.colorRGB[1], render.colorRGB[2]);
  }
  if ("transparent" in render) mat.transparent = !!render.transparent;
  if ("opacity" in render) mat.opacity = render.opacity;
  if ("alphaTest" in render) mat.alphaTest = render.alphaTest;
  if ("depthWrite" in render) mat.depthWrite = !!render.depthWrite;
  if ("depthTest" in render) mat.depthTest = !!render.depthTest;
  if ("toneMapped" in render) mat.toneMapped = !!render.toneMapped;

  if (render.side === "DoubleSide") mat.side = THREE.DoubleSide;
  if (render.side === "FrontSide") mat.side = THREE.FrontSide;
  if (render.side === "BackSide") mat.side = THREE.BackSide;
};

/**
 * Applies mirror material preset
 * @param {THREE.Material} material - The material to apply preset to
 * @param {Object} preset - The preset configuration
 * @param {THREE.WebGLRenderer} renderer - The renderer
 * @param {string} role - The material role (PRINT, MIRROR, BACK, DEFAULT)
 * @param {Object} options - Additional options
 */
export const applyMirrorPreset = (material, preset, renderer, role, options = {}) => {
  // Use BaseMaterial's applyPreset to handle material upgrades and properties
  // BaseMaterial will handle downgrading PhysicalMaterial to StandardMaterial for PRINT if needed
  const updatedMat = applyPreset(material, preset, renderer, role, options);

  // Apply render policy (centralized render flags)
  applyRenderPolicy(updatedMat, preset.render);

  // Role-specific handling
  if (role === "PRINT") {
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
  } else if (role === "BACK") {
    // Remove emissive (mirror back doesn't use emissive, uses bright RGB instead)
    if (updatedMat.emissive) {
      updatedMat.emissive.set(0x000000);
      updatedMat.emissiveIntensity = 0.0;
    }
  }

  return updatedMat;
};

/**
 * Helper function to check if a mesh/material is an artwork layer
 * PRIVATE - not exported to prevent external code from using it to skip mirror materials
 * Mirror materials should be locked via __lockSystem and handled only by applyMirrorState
 */
const isArtworkLayer = (obj, mat) => {
  if (!obj || !mat) return false;

  const meshName = (obj.name || "").toLowerCase();

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

  // No fallback check - only mesh name is reliable
  // Fallback matte-properties check removed to avoid accidentally skipping other matte meshes
  return false;
};

/**
 * Single source of truth for applying mirror material state
 * This is the ONLY function that should modify mirror material properties
 * @param {THREE.Object3D} model - The model to traverse
 * @param {THREE.WebGLRenderer} renderer - The renderer
 * @param {Object} options - Options object
 * @param {number} options.reflectionIntensity - Reflection intensity multiplier
 * @param {boolean} options.showReflections - Whether reflections are enabled
 * @param {Map} options.baseEnvMapIntensities - Map of base envMapIntensity values (optional, for compatibility)
 */
export const applyMirrorState = (
  model,
  renderer,
  {
    reflectionIntensity = 1.0,
    showReflections = true,
    baseEnvMapIntensities = null,
    envMap = null, // Optional: explicitly pass envMap if available
  } = {}
) => {
  if (!model) return;

  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

    mats.forEach((mat) => {
      if (!mat || (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial)) return;

      // ✅ Lock first — prevents any other pipeline from modifying it
      mat.userData = mat.userData || {};
      mat.userData.__lockSystem = "MIRROR";

      // ✅ Single-source role detection
      const role = getMirrorRole(obj, mat);

      // ✅ Single-source preset selection
      const preset =
        role === "PRINT" ? MIRROR_PRESET.PRINT :
        role === "BACK"  ? MIRROR_PRESET.BACK :
                          MIRROR_PRESET.MIRROR;

      // ✅ Apply preset through MirrorMaterial only
      // NOTE: applyMirrorPreset may return a new material if upgrade happens
      const updatedMat = applyMirrorPreset(mat, preset, renderer, role, { reflectionIntensity });
      
      // Use the updated material (in case it was upgraded)
      const finalMat = updatedMat || mat;

      // ✅ Set envMap explicitly - mirror materials need envMap to reflect HDRI
      // CRITICAL: Set envMap AFTER preset application to ensure it's not cleared
      if (envMap) {
        finalMat.envMap = envMap;
      } else {
        // Fallback: rely on scene.environment (set by EnvironmentManager)
        finalMat.envMap = null; // Will use scene.environment
      }
      
      // Update the material reference if it was upgraded
      if (updatedMat !== mat) {
        if (Array.isArray(obj.material)) {
          const matIndex = obj.material.indexOf(mat);
          if (matIndex >= 0) {
            obj.material[matIndex] = finalMat;
          }
        } else {
          obj.material = finalMat;
        }
      }

      // ✅ Store base env intensity on the material itself (survives material replacement)
      const baseFromPreset = typeof preset.envBase === "number" ? preset.envBase : 1.0;
      finalMat.userData = finalMat.userData || {};
      finalMat.userData.__baseEnvIntensity = baseFromPreset;
      // Keep __mirrorEnvBase for backward compatibility
      finalMat.userData.__mirrorEnvBase = baseFromPreset;

      // ✅ Intensity policy (showReflections OFF => 0, ON => base * reflectionIntensity)
      // Use __baseEnvIntensity (standardized) with fallback to __mirrorEnvBase (backward compat)
      const base = finalMat.userData.__baseEnvIntensity ?? finalMat.userData.__mirrorEnvBase ?? 1.0;

      // (Optional compatibility: if you *really* want to respect baseEnvMapIntensities if present)
      const externalBase =
        baseEnvMapIntensities?.get ? baseEnvMapIntensities.get(finalMat) : undefined;

      const resolvedBase = typeof externalBase === "number" ? externalBase : base;

      finalMat.envMapIntensity = showReflections ? (resolvedBase * reflectionIntensity) : 0.0;

      // Keep mirror surface neutral if no texture
      if (role === "MIRROR" && finalMat.color && !finalMat.map) {
        finalMat.color.set(0xffffff);
      }

      finalMat.needsUpdate = true;
    });
  });
};

/**
 * Updates mirror materials when environment map changes
 * Thin wrapper around applyMirrorState() - single source of truth
 * Note: envMap parameter is unused - mirror pipeline uses scene.environment only
 */
export const updateMirrorMaterials = (
  model,
  envMap,
  showReflections,
  reflectionIntensity,
  baseEnvMapIntensities,
  renderer
) => {
  applyMirrorState(model, renderer, {
    reflectionIntensity,
    showReflections,
    baseEnvMapIntensities,
  });
};

/**
 * Updates mirror materials when reflection intensity changes
 * Thin wrapper around applyMirrorState() - single source of truth
 */
export const updateMirrorReflectionIntensity = (
  model,
  reflectionIntensity,
  baseEnvMapIntensities,
  renderer,
  showReflections = true
) => {
  applyMirrorState(model, renderer, {
    reflectionIntensity,
    showReflections,
    baseEnvMapIntensities,
  });
};

/**
 * Default lighting configuration for mirror materials
 */
export const DEFAULT_LIGHTING = {
  exposure: 0.5, // Unified higher exposure default
  ambient: 1.0,
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
