import * as THREE from "three";
import { applyPreset } from "./BaseMaterial.jsx";

/**
 * Acrylic Material Module
 * Handles acrylic print materials with premium 5mm acrylic glass
 */

export const ACRYLIC_PRESET = {
  PRINT: {
    // Artwork layer - keep opaque and crisp
    requiresPhysical: false,
    envBase: undefined, // Preserve original envMapIntensity
    renderOrder: 1, // Render below glass (glass renders on top)
  },
  GLASS: {
    // Premium 5mm acrylic glass - glossy and reflective like glass
    requiresPhysical: true, // Need MeshPhysicalMaterial for transmission
    transmission: 1.0, // Maximum transmission for pure glass transparency
    roughness: 0.02, // Very smooth, glossy surface (even smoother)
    metalness: 0.0,
    clearcoat: 1.0, // Maximum clearcoat for glossy finish
    clearcoatRoughness: 0.02, // Very smooth clearcoat
    ior: 1.49, // Index of refraction for acrylic (close to glass)
    thickness: 0.005, // 5mm thickness in meters
    envBase: 1.6, // Increased reflection intensity for brighter appearance
    renderOrder: 2, // Render on top of artwork (PRINT layer)
  },
  ACRYLIC: {
    // Acrylic material - similar to glass but slightly less transparent
    requiresPhysical: true,
    transmission: 0.98, // Very high transmission, almost pure glass
    roughness: 0.02, // Very smooth, glossy surface
    metalness: 0.0,
    clearcoat: 1.0, // Maximum clearcoat for glossy finish
    clearcoatRoughness: 0.02, // Very smooth clearcoat
    ior: 1.49, // Index of refraction for acrylic
    thickness: 0.005, // 5mm thickness
    envBase: 1.6, // Increased reflection intensity for brighter appearance
    renderOrder: 2, // Render on top of artwork (PRINT layer)
  },
  DEFAULT: {
    // Default acrylic-like properties
    requiresPhysical: true,
    transmission: 0.85,
    roughness: 0.08,
    metalness: 0.0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
    ior: 1.49,
    thickness: 0.005,
    envBase: 1.2,
  },
};

/**
 * Classifies a material for acrylic prints
 */
export const classifyMaterial = ({ meshName, material, materialType }) => {
  const matName = (material?.name || "").toLowerCase();
  const meshNameLower = (meshName || "").toLowerCase();
  
  // PRINT: Has color map (artwork layer) - check this first
  const hasArtworkMap = !!material?.map;
  if (hasArtworkMap) {
    // Only classify as PRINT if it's clearly artwork, not glass with texture
    // If it has transmission, it's likely glass with artwork behind it
    if (material?.transmission === undefined || material.transmission < 0.3) {
      return "PRINT";
    }
  }
  
  // GLASS: Check for glass/cover/plexi indicators OR transmission > 0
  // This includes acrylic covers and transparent materials
  if (
    meshNameLower.includes("glass") ||
    matName.includes("glass") ||
    meshNameLower.includes("cover") ||
    matName.includes("cover") ||
    meshNameLower.includes("plexi") ||
    matName.includes("plexi") ||
    meshNameLower.includes("acrylic_cover") ||
    meshNameLower.includes("acrylic") ||
    matName.includes("acrylic") ||
    (material?.transmission !== undefined && material.transmission > 0.3) ||
    (material?.clearcoat !== undefined && material.clearcoat > 0.5 && material.metalness < 0.1)
  ) {
    return "GLASS";
  }
  
  // ACRYLIC: For acrylic material type, default to ACRYLIC role if not classified above
  if (materialType === "ACRYLIC") {
    return "ACRYLIC";
  }
  
  return "DEFAULT";
};

/**
 * Applies acrylic material preset
 * Makes acrylic materials glossy and glass-like with proper transmission
 */
export const applyAcrylicPreset = (material, preset, renderer, role, options = {}) => {
  // Use BaseMaterial's applyPreset to handle material upgrades and properties
  // BaseMaterial will handle downgrading PhysicalMaterial to StandardMaterial for PRINT if needed
  const updatedMat = applyPreset(material, preset, renderer, role, options);
  
  // For PRINT role (artwork layer), ensure texture is visible
  if (role === "PRINT") {
    // Enable tone mapping so exposure affects brightness
    // This allows the exposure slider to brighten the artwork
    updatedMat.toneMapped = true;
    
    // Ensure transparent for PNG alpha support
    updatedMat.transparent = true;
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
      // Ensure map is not null and is properly set
      if (!updatedMat.map.image) {
        // If texture image is missing, log a warning but don't break
      }
    }
    
    // Ensure white base color for artwork (BaseMaterial already does this, but ensure it)
    if (updatedMat.color) {
      updatedMat.color.set(0xffffff);
    }
  }
  
  // For GLASS and ACRYLIC roles, ensure proper glass-like properties
  if ((role === "GLASS" || role === "ACRYLIC") && updatedMat.isMeshPhysicalMaterial) {
    // Ensure transparency is enabled for transmission
    updatedMat.transparent = true;
    updatedMat.opacity = 1.0; // Full opacity, transparency comes from transmission
    
    // Use a neutral, pure white base for glass so it doesn't tint the artwork
    // This keeps reflections but avoids adding any grey cast to whites behind the acrylic
    updatedMat.color.setRGB(1.0, 1.0, 1.0);
    
    // Set attenuation for realistic light transmission (neutral white)
    updatedMat.attenuationColor = new THREE.Color(0xffffff);
    updatedMat.attenuationDistance = 1.0;
    
    // Depth settings for proper rendering
    updatedMat.depthWrite = false; // Important for transparent materials
    updatedMat.depthTest = true;
    updatedMat.side = THREE.DoubleSide; // Glass should be visible from both sides
  } else if (role !== "PRINT") {
    // For other roles, ensure white base color
    if (updatedMat.color) {
      updatedMat.color.set(0xffffff);
    }
  }
  
  return updatedMat;
};

/**
 * Updates acrylic materials when environment map changes
 * This is called by the main component to update materials
 */
export const updateAcrylicMaterials = (model, envMap, showReflections, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        // Use scene.environment (set by main component)
        mat.envMap = null;
        
        // Get base intensity from the map (stored during initial load)
        const baseIntensity = baseEnvMapIntensities.get(mat);
        
        if (baseIntensity !== undefined) {
          // For glass/acrylic materials, use higher intensity for glossy reflections
          // For print materials, use lower intensity to prevent color spillage
          const isGlassOrAcrylic = mat.isMeshPhysicalMaterial && 
            (mat.transmission !== undefined && mat.transmission > 0.5);
          
          if (isGlassOrAcrylic) {
            // Glass/acrylic: keep strong reflections but slightly reduce intensity
            // to avoid washing out whites behind the acrylic
            mat.envMapIntensity = baseIntensity * 0.8 * reflectionIntensity;
          } else {
            // Print/artwork: give a bit more environment lift so whites stay punchy
            mat.envMapIntensity = baseIntensity * 0.6 * reflectionIntensity;
          }
        } else if (mat.envMapIntensity !== undefined) {
          // Fallback: determine based on material properties
          const isGlassOrAcrylic = mat.isMeshPhysicalMaterial && 
            (mat.transmission !== undefined && mat.transmission > 0.5);
          
          if (isGlassOrAcrylic) {
            mat.envMapIntensity = mat.envMapIntensity * 0.8 * reflectionIntensity;
          } else {
            mat.envMapIntensity = mat.envMapIntensity * 0.6 * reflectionIntensity;
          }
        }
        
        // For glass/acrylic materials, use brighter color
        // For print materials, use white to prevent tinting
        if (mat.color) {
          const isGlassOrAcrylic = mat.isMeshPhysicalMaterial && 
            (mat.transmission !== undefined && mat.transmission > 0.5);
          
          if (isGlassOrAcrylic) {
            // Use brighter color for glass
            mat.color.setRGB(0.98, 0.98, 0.98);
          } else {
            // Print materials use pure white
            mat.color.set(0xffffff);
          }
        }
        
        mat.needsUpdate = true;
      }
    });
  });
};

/**
 * Updates acrylic materials when reflection intensity changes
 */
export const updateAcrylicReflectionIntensity = (model, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        // Get base intensity from the map (stored during initial load)
        const baseIntensity = baseEnvMapIntensities.get(mat);
        
        // Determine if this is a glass/acrylic material or print material
        const isGlassOrAcrylic = mat.isMeshPhysicalMaterial && 
          (mat.transmission !== undefined && mat.transmission > 0.5);
        
        if (baseIntensity !== undefined) {
          if (isGlassOrAcrylic) {
            // Glass/acrylic: keep strong reflections but slightly reduce intensity
            // to avoid washing out whites behind the acrylic
            mat.envMapIntensity = baseIntensity * 0.8 * reflectionIntensity;
          } else {
            // Print/artwork: give a bit more environment lift so whites stay punchy
            mat.envMapIntensity = baseIntensity * 0.6 * reflectionIntensity;
          }
        } else if (mat.envMapIntensity !== undefined) {
          // Fallback: use current intensity
          const currentBase = isGlassOrAcrylic 
            ? mat.envMapIntensity / (1.0 * Math.max(reflectionIntensity, 0.1))
            : mat.envMapIntensity / (0.4 * Math.max(reflectionIntensity, 0.1));
          
          if (isGlassOrAcrylic) {
            mat.envMapIntensity = currentBase * 0.8 * reflectionIntensity;
          } else {
            mat.envMapIntensity = currentBase * 0.6 * reflectionIntensity;
          }
        }
        
        // For glass/acrylic materials, use brighter color
        // For print materials, use white to prevent tinting
        if (mat.color) {
          if (isGlassOrAcrylic) {
            // Use brighter color for glass
            mat.color.setRGB(0.98, 0.98, 0.98);
          } else {
            // Print materials use pure white
            mat.color.set(0xffffff);
          }
        }
        
        mat.needsUpdate = true;
      }
    });
  });
};

/**
 * Default lighting configuration for acrylic materials
 * Optimized for glossy, glass-like appearance with strong reflections
 */
export const DEFAULT_LIGHTING = {
  exposure: 1.8, // Higher default exposure for brighter whites behind acrylic
  ambient: 0.5, // Moderate ambient to allow reflections to show
  key: 1.5, // Strong key light for highlights
  fill: 0.25, // Subtle fill to maintain contrast
  rim: 0.35, // Rim light for edge definition on glossy surfaces
};

/**
 * Acrylic Material Lighting Controls Component
 * Uses LightingManager parent object for lighting state
 */
export const AcrylicLightingControls = ({ lightingManager, reflectionIntensity, onReflectionIntensityChange }) => {
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
      {/* Acrylic-specific controls can be added here */}
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
          Control overall reflection strength on acrylic surface
        </div>
      </div>
    </div>
  );
};
