import * as THREE from "three";
import { applyPreset } from "./BaseMaterial.jsx";

/**
 * Metal Box Material Module
 * Handles 3D folded metal box prints with bold 30mm return edge
 */

export const METAL_BOX_PRESET = {
  PRINT: {
    metalness: 0,
    roughness: 3.0, // Maximum roughness - no reflections at all
    clearcoat: 0,
    clearcoatRoughness: 0,
    envBase: 0.0, // Zero reflection intensity for artwork layer
    specularIntensity: 0.0, // No specular for fully matte finish
    keepMaps: ["map"], // Only keep color map, remove PBR maps
    requiresPhysical: false, // Use StandardMaterial for texture visibility
    renderOrder: 2, // Render on top of metal background (WhiteMetal_FullBleed/Shrunk)
  },
  METAL: {
    metalness: 1.0,
    roughness: 3.0, // Maximum roughness for fully matte finish (no reflections)
    envBase: 0.0, // Zero reflection intensity - completely disable reflections
    requiresPhysical: false,
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
 * Classifies a material for metal box prints
 */
export const classifyMaterial = ({ meshName, material, materialType }) => {
  const matName = (material?.name || "").toLowerCase();
  const meshNameLower = (meshName || "").toLowerCase();
  
  // METAL: Check metalness OR metalnessMap OR metal-related names
  if (
    materialType === "METAL_BOX" ||
    materialType === "METAL" ||
    (material?.metalness !== undefined && material.metalness > 0.4) ||
    material?.metalnessMap ||
    meshNameLower.includes("metal") ||
    matName.includes("metal") ||
    meshNameLower.includes("box") ||
    matName.includes("box") ||
    meshNameLower.includes("frame") ||
    matName.includes("frame")
  ) {
    return "METAL";
  }
  
  // PRINT: Has color map
  const hasArtworkMap = !!material?.map;
  if (hasArtworkMap) {
    return "PRINT";
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
  
  // For PRINT role (artwork layer), ensure texture is visible with very minimal metal PBR
  if (role === "PRINT") {
    // Add very minimal metal PBR properties - just a tiny hint of metal
    updatedMat.metalness = 0.1; // Very small amount of metalness
    updatedMat.roughness = 0.85; // Slightly less than fully matte for subtle reflection
    updatedMat.envMapIntensity = 0.05; // Very minimal environment reflections
    // Keep envMap as null to use scene.environment
    
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
    
    // Make artwork layer much brighter - use higher multiplier like mirror back (3.0)
    // Tone mapping will handle HDR values properly
    if (updatedMat.color) {
      updatedMat.color.setRGB(0.5, 0.5, 0.5); // Moderate brightness boost for artwork
    }
    // Remove emissive to prevent washing out the texture
    if (updatedMat.emissive !== undefined) {
      updatedMat.emissive.setRGB(0, 0, 0);
      updatedMat.emissiveIntensity = 0.0;
    }
    
    updatedMat.needsUpdate = true;
  }
  
  // For METAL role, ensure white metal is super white
  if (role === "METAL") {
    const { metalColor } = options;
    if (metalColor === "white" && updatedMat.color) {
      updatedMat.color.setRGB(2.5, 2.5, 2.5); // Super white for white metal layer
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
 * Artwork layers should maintain their own properties and not be updated by material update functions
 */
const isArtworkLayer = (obj, mat) => {
  if (!obj || !obj.name) return false;
  const objName = obj.name;
  const objNameLower = objName.toLowerCase();
  // Check for artwork mesh names
  return (
    objName === "Artwork_FullBleed" ||
    objName === "Artwork_Shrunk" ||
    (objNameLower.includes("artwork") && 
     (objNameLower.includes("fullbleed") || objNameLower.includes("full_bleed") || objNameLower.includes("shrunk")))
  );
};

/**
 * Updates metal box materials when environment map changes
 * SKIPS artwork layers to preserve their brightness and properties
 */
export const updateMetalBoxMaterials = (model, envMap, showReflections, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    
    // Metal box back: force bright + matte + no reflections (like Mirror_Back)
    if (isMetalBoxBackLayer(obj)) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        applyMetalBoxBackSettings(mat);
      });
      return; // IMPORTANT: don't let generic env logic touch it
    }
    
    // Detect if this is a white metal mesh
    const objNameLower = (obj.name || "").toLowerCase();
    const isWhiteMetal = (objNameLower.includes("white") && objNameLower.includes("metal")) ||
                        objNameLower.includes("whitemetal");
    
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      // SKIP artwork layers - they maintain their own brightness and properties
      if (isArtworkLayer(obj, mat)) {
        return; // Skip this material, preserve its properties
      }
      
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        mat.envMap = null; // Use scene.environment
        const baseIntensity = baseEnvMapIntensities.get(mat);
        if (baseIntensity !== undefined) {
          // Cap reflections to keep it very matte
          const finalIntensity = Math.min(baseIntensity * reflectionIntensity, 0.05);
          mat.envMapIntensity = finalIntensity;
        }
        
        // Force maximum roughness for ALL materials in metal models - no reflections
        if (mat.roughness !== undefined) {
          mat.roughness = 3.0;
        }
        
        // CRITICAL: Re-apply super white for white metal layers to prevent it from being reset
        if (isWhiteMetal && mat.metalness !== undefined && mat.metalness > 0.4) {
          mat.color.setRGB(2.5, 2.5, 2.5); // Super white for white metal
        }
        
        mat.needsUpdate = true;
      }
    });
  });
};

/**
 * Updates metal box materials when reflection intensity changes
 * SKIPS artwork layers to preserve their brightness and properties
 */
export const updateMetalBoxReflectionIntensity = (model, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    
    // Metal box back: keep bright + matte + no reflections (like Mirror_Back)
    if (isMetalBoxBackLayer(obj)) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        applyMetalBoxBackSettings(mat);
      });
      return; // IMPORTANT: don't let generic env logic touch it
    }
    
    // Detect if this is a white metal mesh
    const objNameLower = (obj.name || "").toLowerCase();
    const isWhiteMetal = (objNameLower.includes("white") && objNameLower.includes("metal")) ||
                        objNameLower.includes("whitemetal");
    
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      // SKIP artwork layers - they maintain their own brightness and properties
      if (isArtworkLayer(obj, mat)) {
        return; // Skip this material, preserve its properties
      }
      
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
        
        // CRITICAL: Re-apply super white for white metal layers to prevent it from being reset
        if (isWhiteMetal && mat.metalness !== undefined && mat.metalness > 0.4) {
          mat.color.setRGB(2.5, 2.5, 2.5); // Super white for white metal
        }
        
        mat.needsUpdate = true;
      }
    });
  });
};

/**
 * Updates metal box materials when metal finish changes
 */
export const updateMetalBoxFinish = (model, metalFinish) => {
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
          // For white metal, use super white (HDR values above 1.0) to make it clearly white, not silver-like
          if (metalColor === "white") {
            mat.color.setRGB(2.5, 2.5, 2.5); // Super white - much brighter than silver
          } else {
            mat.color.copy(color);
          }
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
