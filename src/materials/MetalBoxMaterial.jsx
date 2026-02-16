import * as THREE from "three";
import { applyPreset } from "./BaseMaterial.jsx";
import { METAL_FINISH_PRESETS, applyMetalState } from "./MetalMaterial.jsx"; // Use centralized finish presets

/**
 * Metal Box Material Module
 * Handles 3D folded metal box prints with bold 30mm return edge
 */

export const METAL_BOX_PRESET = {
  PRINT: {
    metalness: 0.0, // Non-metallic for vibrant artwork colors (not dull like metal)
    roughness: 0.4, // Moderate roughness - less matte, more vibrant
    clearcoat: 0,
    clearcoatRoughness: 1.0, // Maximum clearcoat roughness
    envBase: 0.0, // No reflections on metal
    specularIntensity: 0.0, // No specular for fully matte finish
    keepMaps: ["map"], // Only keep color map, remove PBR maps
    requiresPhysical: true, // Use PhysicalMaterial (needed for some properties)
    anisotropy: 0.0, // No anisotropy - no directional highlights
    anisotropyRotation: 0.0, // Brush direction (radians)
    renderOrder: 2, // Render on top of metal background (WhiteMetal_FullBleed/Shrunk)
  },
  METAL: {
    metalness: 1.0,
    roughness: 1.0, // Maximum roughness - completely matte, no shininess
    envBase: 0.0, // No reflections on metal
    requiresPhysical: true, // Use PhysicalMaterial (needed for some properties)
    anisotropy: 0.0, // No anisotropy - no directional highlights
    anisotropyRotation: 0.0, // Brush direction (radians)
    renderOrder: 1, // Render below artwork (PRINT layer)
  },
  DEFAULT: {
    metalness: 0,
    roughness: 0.85,
    envBase: 0.6,
    requiresPhysical: false,
  },
};

// Metal finish presets - Use centralized presets from MetalMaterial
// Re-export for compatibility, but all values come from MetalMaterial.METAL_FINISH_PRESETS
export { METAL_FINISH_PRESETS };

/**
 * Classifies a material for metal box prints
 */
export const classifyMaterial = ({ meshName, material }) => {
  const name = (meshName || "").toLowerCase();
  
  // ✅ PRINT FIRST (artwork always priority)
  // Never classify by materialType or metalness - only by actual texture presence
  if (material?.map) {
    return "PRINT";
  }
  
  // METAL meshes by name only (never by materialType flag or metalness value)
  // This prevents circular logic where materialType forces classification
  if (
    name.includes("metal") ||
    name.includes("frame") ||
    name.includes("silver") ||
    name.includes("aluminium") ||
    name.includes("aluminum") ||
    name.includes("box")
  ) {
    return "METAL";
  }
  
  return "DEFAULT";
};

/**
 * Applies metal box material preset
 */
export const applyMetalBoxPreset = (material, preset, renderer, role, options = {}) => {
  // Use BaseMaterial's applyPreset to handle material upgrades and properties
  // BaseMaterial will handle downgrading PhysicalMaterial to StandardMaterial for PRINT if needed
  const updatedMat = applyPreset(material, preset, renderer, role, options);
  
  // For PRINT role (artwork layer), apply metal PBR based on metal color
  if (role === "PRINT") {
    const { metalColor, metalFinish = "brushed" } = options;
    
    // For metal silver, apply proper PBR properties for artwork (non-metallic for vibrancy)
    if (metalColor === "brushed_silver") {
      // CRITICAL FIX: Use low metalness (0.0) for artwork to make it vibrant, not dull
      // metalness = 1.0 makes artwork look dull and metallic - we want printed material appearance
      updatedMat.metalness = 0.0; // Non-metallic for vibrant colors
      
      // Use moderate roughness for better color vibrancy (not too matte)
      // roughness = 1.0 is too matte and makes artwork look dull
      const finishPreset = METAL_FINISH_PRESETS[metalFinish] || METAL_FINISH_PRESETS.brushed;
      updatedMat.roughness = 0.4; // Moderate roughness - less matte, more vibrant (override preset)
      updatedMat.envMapIntensity = finishPreset.envMapIntensityArtwork;
      
      // Apply anisotropy based on finish preset
      if (updatedMat.isMeshPhysicalMaterial) {
        if (updatedMat.anisotropy !== undefined) updatedMat.anisotropy = finishPreset.anisotropy;
        if (updatedMat.anisotropyRotation !== undefined) updatedMat.anisotropyRotation = 0.0; // Brush direction
      }
      
      // Keep envMap as null to use scene.environment
      updatedMat.envMap = null;
    } else {
      // For non-silver metals (white, etc.), use centralized preset
      const finishPreset = METAL_FINISH_PRESETS[metalFinish] || METAL_FINISH_PRESETS.brushed;
      updatedMat.metalness = finishPreset.metalnessNonSilver;
      updatedMat.roughness = finishPreset.roughnessNonSilver;
      updatedMat.envMapIntensity = finishPreset.envMapIntensityNonSilver;
      
      // Disable all specular and clearcoat properties
      if (updatedMat.specularIntensity !== undefined) updatedMat.specularIntensity = finishPreset.specularIntensity || 0.0;
      if (updatedMat.clearcoat !== undefined) updatedMat.clearcoat = finishPreset.clearcoat || 0.0;
      if (updatedMat.clearcoatRoughness !== undefined) updatedMat.clearcoatRoughness = finishPreset.clearcoatRoughness || 1.0;
      if (updatedMat.sheen !== undefined) updatedMat.sheen = finishPreset.sheen || 0.0;
      if (updatedMat.sheenRoughness !== undefined) updatedMat.sheenRoughness = finishPreset.sheenRoughness || 1.0;
      
      // Keep envMap as null to use scene.environment
    }
    
    // Remove all PBR maps - artwork layer only uses color map
    updatedMat.normalMap = null;
    updatedMat.roughnessMap = null;
    updatedMat.metalnessMap = null;
    updatedMat.aoMap = null;
    updatedMat.emissiveMap = null;
    updatedMat.displacementMap = null;
    updatedMat.bumpMap = null;
    updatedMat.clearcoatMap = null;
    updatedMat.clearcoatNormalMap = null;
    updatedMat.clearcoatRoughnessMap = null;
    updatedMat.sheenColorMap = null;
    updatedMat.sheenRoughnessMap = null;
    
    // Remove all clearcoat and specular properties
    if (updatedMat.clearcoat !== undefined) updatedMat.clearcoat = 0.0;
    if (updatedMat.clearcoatRoughness !== undefined) updatedMat.clearcoatRoughness = 1.0;
    if (updatedMat.specularIntensity !== undefined) updatedMat.specularIntensity = 0.0;
    if (updatedMat.sheen !== undefined) updatedMat.sheen = 0.0;
    
    // Enable tone mapping so exposure affects brightness (same clarity as acrylics)
    updatedMat.toneMapped = true;
    
    // Ensure transparent for PNG alpha support - alpha areas will show metal background
    // Use alphaToCoverage to reduce white halo around text edges
    updatedMat.transparent = true;
    updatedMat.opacity = 1.0;
    updatedMat.alphaTest = 0.08; // Higher threshold to remove white fringe pixels (0.05-0.15 range)
    updatedMat.alphaToCoverage = true; // Important: reduces fringes while keeping edges smooth (needs MSAA)
    updatedMat.depthWrite = false; // Critical: don't write to depth buffer so metal background shows through alpha
    updatedMat.depthTest = true; // Enable depth testing for proper layering
    
    // Don't apply transmission to artwork layer (BaseMaterial already handles this, but ensure it)
    if (updatedMat.isMeshPhysicalMaterial) {
      updatedMat.transmission = 0;
      updatedMat.thickness = 0;
      updatedMat.ior = 1.0;
    }
    
    // CRITICAL: Ensure texture map is visible and properly configured with crisp settings
    if (updatedMat.map) {
      // Configure texture for better quality and reduced grain
      const texWidth = updatedMat.map.image?.naturalWidth || updatedMat.map.image?.width || 0;
      const texHeight = updatedMat.map.image?.naturalHeight || updatedMat.map.image?.height || 0;
      const isPOT = texWidth > 0 && texHeight > 0 && 
                   (texWidth & (texWidth - 1)) === 0 && 
                   (texHeight & (texHeight - 1)) === 0;
      
      updatedMat.map.generateMipmaps = isPOT;
      updatedMat.map.minFilter = isPOT ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      updatedMat.map.magFilter = THREE.LinearFilter;
      updatedMat.map.premultiplyAlpha = true;
      
      // Set anisotropy if renderer is available
      if (renderer?.capabilities) {
        updatedMat.map.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
      }
      
      updatedMat.map.needsUpdate = true;
    }
    
    // Apply color tint to blend with metal layer - use centralized preset colors
    if (updatedMat.color) {
      const finishPreset = METAL_FINISH_PRESETS[metalFinish] || METAL_FINISH_PRESETS.brushed;
      if (metalColor === "brushed_silver") {
        // Apply bright silver color from centralized preset
        updatedMat.color.setRGB(
          finishPreset.colorSilver.r,
          finishPreset.colorSilver.g,
          finishPreset.colorSilver.b
        );
      } else {
        // For other metals, use bright white from centralized preset
        updatedMat.color.setRGB(
          finishPreset.colorWhite.r,
          finishPreset.colorWhite.g,
          finishPreset.colorWhite.b
        );
      }
    }
    // Handle emissive based on artworkBrightness option
    // If artworkBrightness > 0 and texture exists, use emissiveMap for brightness boost
    // Otherwise, disable emissive
    const { artworkBrightness = 0 } = options;
    if (updatedMat.emissive !== undefined) {
      if (artworkBrightness > 0 && updatedMat.map) {
        // Enable texture-colored emissive for brightness boost
        updatedMat.emissive.setRGB(1, 1, 1);
        updatedMat.emissiveMap = updatedMat.map;
        updatedMat.emissiveIntensity = artworkBrightness;
        if (updatedMat.map) updatedMat.map.colorSpace = THREE.SRGBColorSpace;
        if (updatedMat.emissiveMap) updatedMat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      } else {
        // Disable emissive
        updatedMat.emissive.setRGB(0, 0, 0);
        updatedMat.emissiveIntensity = 0.0;
        updatedMat.emissiveMap = null;
      }
    }
    
    updatedMat.needsUpdate = true;
  }
  
  // For METAL role, ensure white metal is super white - use centralized preset
  if (role === "METAL") {
    const { metalColor, metalFinish = "brushed" } = options;
    if (metalColor === "white" && updatedMat.color) {
      const finishPreset = METAL_FINISH_PRESETS[metalFinish] || METAL_FINISH_PRESETS.brushed;
      updatedMat.color.setRGB(
        finishPreset.colorWhiteMetal.r,
        finishPreset.colorWhiteMetal.g,
        finishPreset.colorWhiteMetal.b
      );
      updatedMat.needsUpdate = true;
    }
  }
  
  return updatedMat;
};

/**
 * Helper to detect metal box back layer meshes (e.g. MetalBox_Back, Metal_Back) that should be bright and matte
 */
const isMetalBoxBackLayer = (obj) => {
  if (!obj || !obj.name) return false;
  const meshName = obj.name.toLowerCase();
  return (
    meshName === "metalbox_back" ||
    meshName === "metal_box_back" ||
    (meshName.includes("metal") && meshName.includes("back")) ||
    (meshName.includes("box") && meshName.includes("back"))
  );
};

/**
 * Applies matte and bright settings to MetalBox_Back materials
 * Matches Mirror_Back approach: bright RGB with tone mapping enabled, mostly matte
 */
const applyMetalBoxBackSettings = (mat) => {
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
 * Helper to detect artwork layer meshes (Artwork_FullBleed, Artwork_Shrunk)
 */
export const isArtworkLayer = (obj, mat) => {
  if (!obj || !obj.name) return false;
  const objName = obj.name;
  const objNameLower = objName.toLowerCase();
  return (
    objName === "Artwork_FullBleed" ||
    objName === "Artwork_Shrunk" ||
    (objNameLower.includes("artwork") && 
     (objNameLower.includes("fullbleed") || objNameLower.includes("full_bleed") || objNameLower.includes("shrunk")))
  );
};

/**
 * Helper to detect metal mesh by name
 */
const isMetalMesh = (obj) => {
  if (!obj || !obj.name) return false;
  const meshName = (obj.name || "").toLowerCase();
  return (
    meshName.includes("metal") || 
    meshName.includes("silver") || 
    meshName.includes("frame") ||
    meshName.includes("aluminium") ||
    meshName.includes("aluminum") ||
    meshName.includes("box")
  );
};

/**
 * DEPRECATED: Use applyMetalState() instead
 * Updates metal box materials when environment map changes
 * This function now only sets envMap = null, all PBR properties come from applyMetalState()
 */
export const updateMetalBoxMaterials = (model, envMap, showReflections, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;
  
  // Only set environment map - all PBR properties come from applyMetalState()
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    
    if (isMetalBoxBackLayer(obj)) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        applyMetalBoxBackSettings(mat);
      });
      return;
    }
    
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (isArtworkLayer(obj, mat)) {
        return; // Skip artwork layers
      }
      
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        // ONLY set environment map - PBR properties come from applyMetalState()
        mat.envMap = null; // Use scene.environment
        mat.needsUpdate = true;
      }
    });
  });
};

/**
 * DEPRECATED: Use applyMetalState() instead
 * Updates metal box materials when reflection intensity changes
 * This function does nothing - all properties come from applyMetalState()
 */
export const updateMetalBoxReflectionIntensity = (model, reflectionIntensity, baseEnvMapIntensities) => {
  // DO NOTHING - All properties are handled by applyMetalState()
  return;
};

/**
 * Updates metal box materials when metal finish changes
 */
/**
 * DEPRECATED: Use applyMetalState() from MetalMaterial instead
 * Updates metal box materials when metal finish changes
 * This function now just calls applyMetalState() from MetalMaterial
 */
export const updateMetalBoxFinish = (model, metalFinish, metalColor = null) => {
  // Forward to the single source of truth function from MetalMaterial
  applyMetalState(model, null, {
    metalFinish,
    metalColor,
    showReflections: false,
    reflectionIntensity: 1.0
  });
};

/**
 * Updates metal box materials when metal color changes
 */
export const updateMetalBoxColor = (model, metalColor) => {
  if (!model) return;
  
  const METAL_COLOR_MAP = {
    brushed_silver: new THREE.Color(0x9696a0), // Brushed silver - darker silver (RGB: 150, 150, 160) that maintains silver appearance when exposure is enhanced
    white: new THREE.Color(0xffffff), // White color
  };
  
  const color = METAL_COLOR_MAP[metalColor];
  if (!color) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        if (mat.metalness !== undefined && mat.metalness > 0.4) {
          // For white metal, use super white from centralized preset
          if (metalColor === "white") {
            // Use brushed finish for white metal (default)
            const finishPreset = METAL_FINISH_PRESETS.brushed;
            mat.color.setRGB(
              finishPreset.colorWhiteMetal.r,
              finishPreset.colorWhiteMetal.g,
              finishPreset.colorWhiteMetal.b
            );
          } else {
            mat.color.copy(color);
          }
          mat.needsUpdate = true;
        }
        // Also update PRINT role materials (artwork layers with texture maps)
        // For silver artwork layers, apply bright color from centralized preset
        if (mat.map && metalColor === "brushed_silver") {
          // Use brushed finish for artwork (default)
          const finishPreset = METAL_FINISH_PRESETS.brushed;
          mat.color.setRGB(
            finishPreset.colorSilver.r,
            finishPreset.colorSilver.g,
            finishPreset.colorSilver.b
          );
          mat.needsUpdate = true;
        }
      }
    });
  });
};

/**
 * Default lighting configuration for metal box materials
 * Bright lighting for visibility with minimal reflections
 */
export const DEFAULT_LIGHTING = {
  exposure: 2.0, // Standard exposure for metal box (matches other metals)
  ambient: 0.8, // Higher ambient for overall brightness
  key: 2.0, // Stronger key light
  fill: 0.6, // More fill light
  rim: 0.5, // More rim light
};

/**
 * Metal Box Material Lighting Controls Component
 */
export const MetalBoxLightingControls = ({ lightingManager, reflectionIntensity, onReflectionIntensityChange, metalFinish, onMetalFinishChange, metalColor, onMetalColorChange }) => {
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
          Select metal box finish: Brushed Silver or Brushed White
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
          Adjust metal box surface roughness (polished = smooth, brushed = textured)
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
          Control reflection on 3D metal box surface
        </div>
      </div>
    </div>
  );
};
