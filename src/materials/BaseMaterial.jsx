import * as THREE from "three";
import { METAL_FINISH_PRESETS, isMetalLocked } from "./MetalMaterial.jsx";

/**
 * Base material utilities shared across all material types
 */

/**
 * Applies a material preset to a material, ensuring correct material type and properties
 * @param {THREE.Material} material - The material to modify
 * @param {Object} preset - The preset configuration
 * @param {THREE.WebGLRenderer} renderer - Renderer for texture settings
 * @param {string} role - Material role (for special handling)
 * @param {Object} options - Additional options (e.g., metalFinish)
 * @returns {THREE.Material} - The (possibly replaced) material
 */
// Metal color constants
const METAL_COLOR_MAP = {
  brushed_silver: new THREE.Color(0x9696a0), // Brushed silver - darker silver (RGB: 150, 150, 160) that maintains silver appearance when exposure is enhanced
  white: new THREE.Color(0xffffff), // White color
};


export const applyPreset = (material, preset, renderer, role, options = {}) => {
  let mat = material;
  const { materialType, metalColor } = options;
  
  // CRITICAL: If material is locked to metal system, do not modify it
  // MetalMaterial.applyMetalState() is the ONLY place allowed to touch locked metal materials
  if (isMetalLocked(mat)) {
    console.warn(`[applyPreset] Material is locked to METAL system - skipping modification. Use MetalMaterial.applyMetalState() instead.`);
    return mat;
  }
  
  // Check if this is a metal type - if so, we'll early-return after material conversion
  const isMetalType = materialType === "METAL" || materialType === "METAL_BOX";
  
  
  // For PRINT role, if requiresPhysical is false, ensure we use StandardMaterial
  // This is critical for texture visibility - PhysicalMaterial with transmission can hide textures
  if (role === "PRINT" && !preset.requiresPhysical && mat.isMeshPhysicalMaterial) {
    const standardMat = new THREE.MeshStandardMaterial();
    // CRITICAL: Only preserve the color map (artwork texture) - NO PBR maps for artwork layer
    if (mat.map) {
      standardMat.map = mat.map;
      // Ensure map texture is properly configured and visible
      standardMat.map.needsUpdate = true;
    }
    // Explicitly DO NOT copy PBR maps - artwork layer must be independent
    // Only copy alphaMap if it exists (for transparency support)
    if (mat.alphaMap) standardMat.alphaMap = mat.alphaMap;
    standardMat.color.copy(mat.color || new THREE.Color(0xffffff));
    standardMat.name = mat.name;
    // Copy other important properties
    standardMat.transparent = mat.transparent || false;
    standardMat.opacity = mat.opacity !== undefined ? mat.opacity : 1.0;
    standardMat.side = mat.side !== undefined ? mat.side : THREE.FrontSide;
    // Preserve depth settings for transparency (alpha areas showing background)
    standardMat.depthWrite = mat.depthWrite !== undefined ? mat.depthWrite : false;
    standardMat.depthTest = mat.depthTest !== undefined ? mat.depthTest : true;
    standardMat.alphaTest = mat.alphaTest !== undefined ? mat.alphaTest : 0.001;
    mat = standardMat;
  }
  
  // Ensure correct material type
  if (preset.requiresPhysical && !mat.isMeshPhysicalMaterial) {
    const phys = new THREE.MeshPhysicalMaterial();
    // Preserve existing maps
    if (mat.map) {
      phys.map = mat.map;
      // Ensure map texture is properly configured
      if (phys.map) {
        phys.map.needsUpdate = true;
      }
    }
    if (mat.alphaMap) phys.alphaMap = mat.alphaMap;
    if (mat.normalMap) phys.normalMap = mat.normalMap;
    if (mat.roughnessMap) phys.roughnessMap = mat.roughnessMap;
    if (mat.metalnessMap) phys.metalnessMap = mat.metalnessMap;
    phys.color.copy(mat.color || new THREE.Color(0xffffff));
    phys.name = mat.name;
    // Preserve transparency basics
    phys.transparent = mat.transparent || false;
    phys.opacity = mat.opacity ?? 1.0;
    phys.side = mat.side ?? THREE.FrontSide;
    phys.depthWrite = mat.depthWrite ?? true;
    phys.depthTest = mat.depthTest ?? true;
    phys.alphaTest = mat.alphaTest ?? 0.0;
    // Preserve sheen properties if they exist on the original material
    if (mat.sheen !== undefined) phys.sheen = mat.sheen;
    if (mat.sheenRoughness !== undefined) phys.sheenRoughness = mat.sheenRoughness;
    if (mat.sheenColor !== undefined) phys.sheenColor.copy(mat.sheenColor);
    if (mat.sheenColorMap) phys.sheenColorMap = mat.sheenColorMap;
    if (mat.sheenRoughnessMap) phys.sheenRoughnessMap = mat.sheenRoughnessMap;
    mat = phys;
  }
  
  // ✅ HARD LOCK: if METAL/METAL_BOX, stop here.
  // MetalMaterial.applyMetalState is the ONLY place allowed to touch PBR + color + transparency.
  if (isMetalType) {
    // 🔒 Lock immediately on conversion - prevents any other system from modifying
    if (!mat.userData) mat.userData = {};
    mat.userData.__lockSystem = "METAL";
    
    mat.envMap = null;       // fine: forces scene.environment usage
    mat.needsUpdate = true;
    return mat;
  }
  
  // ---- below this point: non-metal only ----
  
  // Apply preset properties (only if they exist on the material)
  if (preset.metalness !== undefined && mat.metalness !== undefined) {
    mat.metalness = preset.metalness;
  }
  if (preset.roughness !== undefined && mat.roughness !== undefined) {
    mat.roughness = preset.roughness;
  }
  if (preset.clearcoat !== undefined && mat.clearcoat !== undefined) {
    mat.clearcoat = preset.clearcoat;
  }
  if (preset.clearcoatRoughness !== undefined && mat.clearcoatRoughness !== undefined) {
    mat.clearcoatRoughness = preset.clearcoatRoughness;
  }
  if (preset.specularIntensity !== undefined && mat.specularIntensity !== undefined) {
    mat.specularIntensity = preset.specularIntensity;
  }
  if (preset.sheen !== undefined && mat.sheen !== undefined) {
    mat.sheen = preset.sheen;
  }
  if (preset.sheenRoughness !== undefined && mat.sheenRoughness !== undefined) {
    mat.sheenRoughness = preset.sheenRoughness;
  }
  // These properties can be set for all materials (not PBR-specific)
  if (preset.transmission !== undefined && mat.transmission !== undefined) {
    mat.transmission = preset.transmission;
  }
  if (preset.ior !== undefined && mat.ior !== undefined) {
    mat.ior = preset.ior;
  }
  if (preset.thickness !== undefined && mat.thickness !== undefined) {
    mat.thickness = preset.thickness;
  }
  if (preset.sheenColor !== undefined && mat.sheenColor !== undefined) {
    mat.sheenColor.copy(preset.sheenColor);
  }
  
  // Handle texture maps based on role
  if (preset.keepMaps) {
    // For PRINT: only keep specified maps, remove others
    const mapsToKeep = new Set(preset.keepMaps);
    const allMapTypes = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 
                         'emissiveMap', 'alphaMap', 'displacementMap', 'bumpMap'];
    allMapTypes.forEach(mapType => {
      if (!mapsToKeep.has(mapType)) {
        mat[mapType] = null;
      }
    });
  }
  
  // Role-specific handling (non-metal only)
  if (role === "PRINT") {
    // For metal materials, use metal color (brushed_silver or white)
    // For wood materials, don't set white color (keep original to show texture without tinting)
    // For other non-metal materials, use white (no tinting)
    const materialType = options.materialType;
    if (metalColor && METAL_COLOR_MAP[metalColor]) {
      mat.color.copy(METAL_COLOR_MAP[metalColor]);
    } else if (materialType === "WOOD") {
      // For wood materials, don't set white color - keep original color to show texture naturally
      // This allows textures on Artwork_FullBleed to display without white tinting
    } else {
      // For other non-metal materials, use white (no tinting)
      mat.color.set(0xffffff);
    }
    mat.transparent = false;
    mat.opacity = 1.0;
    
    // CRITICAL: Ensure texture map is visible and properly configured with crisp settings
    if (mat.map) {
      mat.map.colorSpace = THREE.SRGBColorSpace;
      
      // Check if texture is power-of-two for mipmap decision
      const texWidth = mat.map.image?.naturalWidth || mat.map.image?.width || 0;
      const texHeight = mat.map.image?.naturalHeight || mat.map.image?.height || 0;
      const isPOT = texWidth > 0 && texHeight > 0 && 
                   (texWidth & (texWidth - 1)) === 0 && 
                   (texHeight & (texHeight - 1)) === 0;
      
      // Only enable mipmaps for power-of-two textures to avoid grain
      mat.map.generateMipmaps = isPOT;
      mat.map.minFilter = isPOT ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      mat.map.magFilter = THREE.LinearFilter;
      mat.map.premultiplyAlpha = true; // Prevent edge halos
      
      // Set anisotropy for better quality at oblique angles
      if (renderer?.capabilities) {
        mat.map.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
      } else {
        mat.map.anisotropy = 16;
      }
      
      mat.map.needsUpdate = true; // Force texture update
    }
    
    // Ensure no transmission properties that could hide texture
    if (mat.isMeshPhysicalMaterial) {
      mat.transmission = 0;
      mat.thickness = 0;
      mat.ior = 1.0;
    }
  }
  
  if (role === "GLASS") {
    // Use brighter color for glass while maintaining transparency
    // Bright but not pure white to allow reflections to show through
    mat.color.set(0xfafafa); // Very bright, almost white
    mat.transparent = true;
    mat.opacity = 1.0;
    if (preset.transmission !== undefined && mat.transmission !== undefined) {
      mat.transmission = preset.transmission;
    }
    if (preset.ior !== undefined && mat.ior !== undefined) {
      mat.ior = preset.ior;
    }
    if (preset.thickness !== undefined && mat.thickness !== undefined) {
      mat.thickness = preset.thickness;
    }
    mat.attenuationColor = new THREE.Color(0xffffff);
    mat.attenuationDistance = 1.0;
    mat.depthWrite = false;
    mat.depthTest = true;
    mat.side = THREE.DoubleSide;
  }
  
  if (role === "METAL") {
    // Apply metal color if provided
    if (metalColor && METAL_COLOR_MAP[metalColor]) {
      // For white metal, use super white (HDR values) to make it clearly white, not silver-like
      if (metalColor === "white") {
        mat.color.setRGB(2.5, 2.5, 2.5); // Super white - much brighter than silver
      } else {
        mat.color.copy(METAL_COLOR_MAP[metalColor]);
      }
    } else {
      mat.color.set(0xffffff); // Default to white if no specific color or invalid
    }
    // Keep all PBR maps for metal (don't remove roughness/metalness/normal maps)
  }
  
  if (role === "DEFAULT") {
    mat.transparent = false;
    mat.opacity = 1.0;
  }
  
  // Only non-metal materials may use envMap/envMapIntensity
  // MetalMaterial.applyMetalState() is the ONLY authority for metal materials
  if (!isMetalLocked(mat)) {
    // Always use scene.environment (not per-material envMap)
    // The main component will assign the environment map after HDRI loads
    mat.envMap = null;
    
    // Ensure environment map intensity is set (will be adjusted by main component)
    if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
      mat.envMapIntensity = preset.envBase || 1.0;
    }
  }
  
  mat.needsUpdate = true;
  
  return mat;
};
