import * as THREE from "three";

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
  brushed_silver: new THREE.Color(0xe8e8f0), // Brushed silver - bright silver with slight blue tint (RGB: 232, 232, 240) for increased brightness
  white: new THREE.Color(0xffffff), // White color
};

// Metal finish presets
const METAL_FINISH_PRESETS = {
  polished: { roughness: 0.05 }, // Very smooth, highly reflective, mirror-like
  brushed: { roughness: 0.75 }, // Very matte, minimal reflections, brushed texture
};

export const applyPreset = (material, preset, renderer, role, options = {}) => {
  let mat = material;
  const { metalFinish = "polished", metalColor = null } = options;
  
  // For PRINT role, if requiresPhysical is false, ensure we use StandardMaterial
  // This is critical for texture visibility - PhysicalMaterial with transmission can hide textures
  if (role === "PRINT" && !preset.requiresPhysical && mat.isMeshPhysicalMaterial) {
    const standardMat = new THREE.MeshStandardMaterial();
    // CRITICAL: Preserve all texture maps - especially the map (artwork texture)
    if (mat.map) {
      standardMat.map = mat.map;
      // Ensure map texture is properly configured and visible
      standardMat.map.needsUpdate = true;
    }
    if (mat.normalMap) standardMat.normalMap = mat.normalMap;
    if (mat.roughnessMap) standardMat.roughnessMap = mat.roughnessMap;
    if (mat.metalnessMap) standardMat.metalnessMap = mat.metalnessMap;
    if (mat.aoMap) standardMat.aoMap = mat.aoMap;
    if (mat.emissiveMap) standardMat.emissiveMap = mat.emissiveMap;
    if (mat.alphaMap) standardMat.alphaMap = mat.alphaMap;
    standardMat.color.copy(mat.color || new THREE.Color(0xffffff));
    standardMat.name = mat.name;
    // Copy other important properties
    standardMat.transparent = mat.transparent || false;
    standardMat.opacity = mat.opacity !== undefined ? mat.opacity : 1.0;
    standardMat.side = mat.side !== undefined ? mat.side : THREE.FrontSide;
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
    if (mat.normalMap) phys.normalMap = mat.normalMap;
    if (mat.roughnessMap) phys.roughnessMap = mat.roughnessMap;
    if (mat.metalnessMap) phys.metalnessMap = mat.metalnessMap;
    phys.color.copy(mat.color || new THREE.Color(0xffffff));
    phys.name = mat.name;
    mat = phys;
  }
  
  // Apply preset properties (only if they exist on the material)
  if (preset.metalness !== undefined && mat.metalness !== undefined) {
    mat.metalness = preset.metalness;
  }
  if (preset.roughness !== undefined && mat.roughness !== undefined) {
    // Override roughness for metal based on finish
    if (role === "METAL" && metalFinish && METAL_FINISH_PRESETS[metalFinish]) {
      mat.roughness = METAL_FINISH_PRESETS[metalFinish].roughness;
    } else {
      mat.roughness = preset.roughness;
    }
  }
  if (preset.clearcoat !== undefined && mat.clearcoat !== undefined) {
    mat.clearcoat = preset.clearcoat;
  }
  if (preset.clearcoatRoughness !== undefined && mat.clearcoatRoughness !== undefined) {
    mat.clearcoatRoughness = preset.clearcoatRoughness;
  }
  if (preset.transmission !== undefined && mat.transmission !== undefined) {
    mat.transmission = preset.transmission;
  }
  if (preset.ior !== undefined && mat.ior !== undefined) {
    mat.ior = preset.ior;
  }
  if (preset.thickness !== undefined && mat.thickness !== undefined) {
    mat.thickness = preset.thickness;
  }
  if (preset.specularIntensity !== undefined && mat.specularIntensity !== undefined) {
    mat.specularIntensity = preset.specularIntensity;
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
  
  // Role-specific handling
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
    
    // CRITICAL: Ensure texture map is visible and properly configured
    if (mat.map) {
      mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.map.generateMipmaps = true;
      mat.map.minFilter = THREE.LinearMipmapLinearFilter;
      mat.map.magFilter = THREE.LinearFilter;
      mat.map.anisotropy = renderer?.capabilities?.getMaxAnisotropy() || 16;
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
    mat.color = new THREE.Color(0xfafafa); // Very bright, almost white
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
      mat.color.copy(METAL_COLOR_MAP[metalColor]);
    } else {
      mat.color.set(0xffffff); // Default to white if no specific color or invalid
    }
    // Keep all PBR maps for metal (don't remove roughness/metalness/normal maps)
  }
  
  if (role === "DEFAULT") {
    mat.transparent = false;
    mat.opacity = 1.0;
  }
  
  // Always use scene.environment (not per-material envMap)
  // The main component will assign the environment map after HDRI loads
  mat.envMap = null;
  
  // Ensure environment map intensity is set (will be adjusted by main component)
  if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
    mat.envMapIntensity = preset.envBase || 1.0;
  }
  
  mat.needsUpdate = true;
  
  return mat;
};
