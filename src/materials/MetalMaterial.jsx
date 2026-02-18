import * as THREE from "three";
import { applyPreset } from "./BaseMaterial.jsx";

/**
 * Metal Material Module
 * SINGLE SOURCE OF TRUTH - Only this file sets PBR properties for metals
 * All other files must call applyMetalState() and cannot override metal properties
 */

export const METAL_PRESET = {
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
    renderOrder: 2, // Render on top of metal background (Silver_FullBleed/Shrunk)
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

// SINGLE SOURCE OF TRUTH - All metal PBR properties come from here
// Change values here and they apply everywhere - no other file can override
export const METAL_FINISH_PRESETS = {
  polished: { 
    roughness: 0.15, // Polished metal - very smooth, high reflectivity
    roughnessArtwork: 1.0, // Artwork layer stays matte
    envMapIntensity: 0.0, // Artwork has no reflections
    envMapIntensityArtwork: 0.0, // No reflections on artwork
    envMapIntensityMetal: 1.2, // Subtle environment map reflections for polished metal
    anisotropy: 0.1, // Polished - minimal directional highlights
    anisotropyRotation: 0.0, // Brush direction
    sheen: 0.0, // No sheen - no reflections
    sheenRoughness: 1.0, // Maximum spread
    specularIntensity: 0.0, // No specular highlights
    clearcoat: 0.0, // No clearcoat - no reflections
    clearcoatRoughness: 1.0, // Maximum clearcoat roughness
    // Color values - preserve original model colors (don't override)
    colorSilver: { r: 1.0, g: 1.0, b: 1.0 }, // Neutral - use original model color
    colorWhite: { r: 1.0, g: 1.0, b: 1.0 }, // Neutral - use original model color
    colorWhiteMetal: { r: 1.0, g: 1.0, b: 1.0 }, // Neutral - use original model color
    // Non-silver metal properties (for white, etc.)
    metalnessNonSilver: 0.1, // Very small amount of metalness for non-silver
    roughnessNonSilver: 0.15, // Same as polished
    envMapIntensityNonSilver: 0.0, // No environment map reflections
  },
  brushed: { 
    roughness: 3, // Brushed metal - moderate roughness for grain visibility
    roughnessArtwork: 1.0, // Artwork layer stays matte
    envMapIntensity: 0.0, // Artwork has no reflections
    envMapIntensityArtwork: 0.0, // No reflections on artwork
    envMapIntensityMetal: 1.2, // Subtle environment map reflections for polished metal
    anisotropy: 0.65, // Brushed metal - strong directional highlights
    anisotropyRotation: 0.0, // Brush direction (can be adjusted per mesh)
    sheen: 0.0, // No sheen - no reflections
    sheenRoughness: 1.0, // Maximum spread
    specularIntensity: 0.0, // No specular highlights
    clearcoat: 0.0, // No clearcoat - no reflections
    clearcoatRoughness: 1.0, // Maximum clearcoat roughness
    // Color values - preserve original model colors (don't override)
    colorSilver: { r: 1.0, g: 1.0, b: 1.0 }, // Neutral - use original model color
    colorWhite: { r: 1.0, g: 1.0, b: 1.0 }, // Neutral - use original model color
    colorWhiteMetal: { r: 1.0, g: 1.0, b: 1.0 }, // Neutral - use original model color
    // Non-silver metal properties (for white, etc.)
    metalnessNonSilver: 0.1, // Very small amount of metalness for non-silver
    roughnessNonSilver: 0.45, // Same as brushed
    envMapIntensityNonSilver: 0.0, // No environment map reflections
  },
};

/**
 * Check if a material is locked to the metal system
 * Use this to prevent other systems from modifying metal materials
 */
export const isMetalLocked = (mat) => {
  return mat?.userData?.__lockSystem === "METAL";
};

/**
 * Classifies a material for metal prints
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
    name.includes("aluminum")
  ) {
    return "METAL";
  }
  
  return "DEFAULT";
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
 * Helper to detect metal back layer meshes (e.g. Metal_Back)
 */
const isMetalBackLayer = (obj) => {
  if (!obj || !obj.name) return false;
  const meshName = obj.name.toLowerCase();
  return (
    meshName === "metal_back" ||
    (meshName.includes("metal") && meshName.includes("back"))
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
    meshName.includes("aluminum")
  );
};

/**
 * Applies metal material preset (for initial material setup)
 * This is called by MaterialProcessor during initial material processing
 * It only handles material type conversion and basic setup - PBR values come from applyMetalState()
 */
export const applyMetalPreset = (material, preset, renderer, role, options = {}) => {
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
    
    // Apply bright color to blend with metal layer - use centralized preset colors
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
 * Applies matte and bright settings to Metal_Back materials
 */
const applyMetalBackSettings = (mat) => {
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
 * CRITICAL: Snapshot original metal properties immediately after GLTF load
 * Must be called BEFORE any preset system or material processing touches materials
 * This preserves true original values before any mutations
 * 
 * @param {THREE.Object3D} model - The 3D model (freshly loaded, before presets)
 */
export const snapshotOriginalMetal = (model) => {
  if (!model) return;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (!(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) return;
      if (!mat.userData) mat.userData = {};
      
      // Only snapshot if not already stored (idempotent)
      if (!mat.userData.__originalMetal) {
        mat.userData.__originalMetal = {
          metalness: mat.metalness !== undefined ? mat.metalness : 1.0,
          roughness: mat.roughness !== undefined ? mat.roughness : 0.5,
          envMapIntensity: mat.envMapIntensity !== undefined ? mat.envMapIntensity : 1.0,
          color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
          normalMap: mat.normalMap || null,
          roughnessMap: mat.roughnessMap || null,
          metalnessMap: mat.metalnessMap || null,
          clearcoat: mat.clearcoat !== undefined ? mat.clearcoat : 0,
          sheen: mat.sheen !== undefined ? mat.sheen : 0,
          specularIntensity: mat.specularIntensity !== undefined ? mat.specularIntensity : 0,
        };
      }
    });
  });
};

/**
 * SINGLE SOURCE OF TRUTH - Only function that sets metal PBR properties
 * All other files must call this - they cannot set metal PBR values directly
 * 
 * @param {THREE.Object3D} model - The 3D model
 * @param {THREE.WebGLRenderer} renderer - The renderer (optional)
 * @param {Object} state - Metal state configuration
 * @param {string} state.metalFinish - "brushed" | "polished"
 * @param {string} state.metalColor - "brushed_silver" | "white" | null
 * @param {boolean} [state.showReflections] - Whether to show reflections (optional)
 * @param {number} [state.reflectionIntensity] - Reflection intensity (optional, not used for metals)
 * @param {number} [state.artworkBrightness] - Artwork brightness boost (0.0-1.0, default 0.0)
 */
export const applyMetalState = (model, renderer, state) => {
  if (!model) {
    if (process.env.NODE_ENV === 'development') {
      console.warn("[applyMetalState] No model provided");
    }
    return;
  }
  
  const { 
    metalFinish = "brushed", 
    metalColor = null,
    showReflections = false,
    reflectionIntensity = 1.0,
    artworkBrightness = 0.0
  } = state;
  
  // CRITICAL FIX: Normalize metalColor to prevent null/undefined causing re-runs
  const normalizedColor = metalColor ?? "brushed_silver";
  
  // Prevent duplicate execution - state version lock (idempotent)
  // CRITICAL: Include showReflections and reflectionIntensity in key so reflection changes trigger updates
  // Without this, reflection state changes are ignored due to early return
  const stateKey = `${metalFinish}_${normalizedColor}_${artworkBrightness}_${showReflections ? 1 : 0}_${reflectionIntensity}`;
  if (model.userData?.__metalStateKey === stateKey) {
    return; // Already applied this exact state
  }
  model.userData.__metalStateKey = stateKey;
  
  // Get preset from SINGLE SOURCE OF TRUTH
  let finishPreset = METAL_FINISH_PRESETS[metalFinish];
  if (!finishPreset) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[applyMetalState] No preset found for finish: ${metalFinish}, using brushed`);
    }
    finishPreset = METAL_FINISH_PRESETS.brushed;
  }
  
  let metalLayerCount = 0;
  let artworkLayerCount = 0;
  
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    
    const meshName = (obj.name || "").toLowerCase();
    const isMetalMeshByName = isMetalMesh(obj);
    
    // Metal back: force bright + matte + no reflections (like Mirror_Back)
    if (isMetalBackLayer(obj)) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        applyMetalBackSettings(mat);
        // CRITICAL: Tag metal back as locked to metal system - prevents other systems from modifying it
        if (!mat.userData) mat.userData = {};
        mat.userData.__lockSystem = "METAL";
      });
      return; // IMPORTANT: don't let generic logic touch it
    }
    
    // Detect if this is a white metal mesh
    const isWhiteMetal = (meshName.includes("white") && meshName.includes("metal")) ||
                        meshName.includes("whitemetal");
    
    // Detect if this is a silver metal background mesh (Silver_FullBleed, Silver_Shrunk, etc.)
    // These are the metal layers that should be visible behind artwork
    const isSilverMetalBackground = (meshName.includes("silver") && 
                                     (meshName.includes("fullbleed") || meshName.includes("full_bleed") || 
                                      meshName.includes("shrunk") || meshName.includes("shrink"))) &&
                                    !meshName.includes("artwork"); // Exclude artwork layers
    
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      // SKIP artwork layers - they maintain their own brightness and properties
      if (isArtworkLayer(obj, mat)) {
        return; // Skip this material, preserve its properties
      }
      
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        // Check if this is a metal material (by metalness OR by mesh name)
        // CRITICAL: For silver metal background meshes, always process them regardless of initial metalness
        // This ensures they are made visible even if their metalness was set to 0.0 previously
        const isMetalMaterial = isSilverMetalBackground || // Always process silver metal background
                               (mat.metalness !== undefined && mat.metalness > 0.4) || 
                               isMetalMeshByName;
        
        if (isMetalMaterial) {
          metalLayerCount++;
          
          // ============================================
          // CRITICAL: Set render order - metal must render BEFORE artwork
          // ============================================
          obj.renderOrder = 1; // Metal layer renders first (behind artwork)
          
          // ============================================
          // CRITICAL FIX: Ensure metal participates in depth pipeline
          // Metal MUST be opaque and write depth to block back layer
          // ============================================
          mat.transparent = false; // Metal is opaque - no transparency
          mat.depthWrite = true; // CRITICAL: Write to depth buffer to block back layer
          mat.depthTest = true; // Enable depth testing for proper layering
          mat.opacity = 1.0; // Fully opaque
          
          // ============================================
          // PRESERVE ORIGINAL METAL APPEARANCE
          // Restore from snapshot (must be called after snapshotOriginalMetal)
          // ============================================
          const orig = mat.userData?.__originalMetal;
          if (!orig) {
            if (process.env.NODE_ENV === 'development') {
              console.warn(`[applyMetalState] No original snapshot found for ${obj.name} - call snapshotOriginalMetal() first!`);
            }
            // Fallback: use current values (not ideal, but prevents crash)
            return;
          }
          
          // ============================================
          // RESTORE METAL APPEARANCE WITH REALISTIC PBR
          // Clamp to reasonable ranges and apply finish-specific values
          // ============================================
          
          // Clamp metalness and roughness to realistic ranges (prevents chalk-like appearance)
          // Increased metalness slightly for better light source reflections
          if (mat.metalness !== undefined) {
            const metalnessValue = orig.metalness ?? 1.0;
            mat.metalness = Math.max(1, Math.min(1.0, metalnessValue)); // Increased to 0.98 for better light reflections
          }
          if (mat.roughness !== undefined) {
            // Use preset roughness for finish, but clamp original if it's reasonable
            const presetRoughness = finishPreset.roughness ?? 0.45;
            const origRoughness = orig.roughness ?? presetRoughness;
            const clampedRoughness = Math.max(0.15, Math.min(0.65, origRoughness)); // Clamp 0.15-0.65
            // Use preset roughness (finish-specific) for consistent appearance
            mat.roughness = presetRoughness;
          }
          // Apply darker silver color for silver metal backgrounds
          // Brighten non-silver metals for better visibility
          if (mat.color) {
            if (isSilverMetalBackground) {
              // Darker silver color - darker grey with slight blue tint
              mat.color.setRGB(0.5, 0.5, 0.52); // Darker silver shade
            } else if (orig.color) {
              // For other metals, brighten original color by 1.6x for better visibility
              mat.color.copy(orig.color);
              mat.color.multiplyScalar(1.6); // Brighten by 60% for better visibility
            }
          }
          
          // ============================================
          // APPLY REFLECTIONS AND ANISOTROPY (makes metal look like metal)
          // ============================================
          
          // Determine if reflections should be enabled
          const wantsReflections = !!showReflections;
          
          // Apply environment map intensity from preset (subtle reflections)
          // Keep envMap intact (uses scene.environment) - only set intensity
          mat.envMap = null; // Use scene.environment
          if (wantsReflections) {
            // Apply preset intensity scaled by reflectionIntensity
            mat.envMapIntensity = (finishPreset.envMapIntensityMetal ?? 0.6) * reflectionIntensity;
          } else {
            mat.envMapIntensity = 0.0;
          }
          
          // ============================================
          // DISABLE SPECULAR REFLECTIONS (reduce light reflections)
          // ============================================
          if ("specularIntensity" in mat) {
            // Force specular to 0 to minimize light reflections
            mat.specularIntensity = 0.0;
          }
          if ("specularColor" in mat) {
            // Set specular color to black to eliminate specular highlights
            mat.specularColor.setRGB(0, 0, 0);
          }
          
          // ============================================
          // APPLY ANISOTROPY (brushed metal directional highlights)
          // ============================================
          if (mat.isMeshPhysicalMaterial) {
            if (wantsReflections && finishPreset.anisotropy !== undefined) {
              mat.anisotropy = finishPreset.anisotropy;
              mat.anisotropyRotation = finishPreset.anisotropyRotation ?? 0.0;
            } else {
              mat.anisotropy = 0.0;
              mat.anisotropyRotation = 0.0;
            }
            
            // ============================================
            // DISABLE ALL REFLECTIONS (clearcoat and sheen)
            // ============================================
            // Force clearcoat to 0 - no reflections
            mat.clearcoat = 0.0;
            mat.clearcoatRoughness = 1.0;
            
            // Force sheen to 0 - no reflections
            mat.sheen = 0.0;
            mat.sheenRoughness = 1.0;
            
            // Disable transmission/thickness (not needed for metal)
            if ("transmission" in mat) mat.transmission = 0;
            if ("thickness" in mat) mat.thickness = 0;
            if ("ior" in mat) mat.ior = 1.0;
            
            // Disable reflectivity - no reflections
            if ("reflectivity" in mat) mat.reflectivity = 0;
          }
          
          // ============================================
          // PRESERVE PBR MAPS (normal, roughness, metalness)
          // These provide micro-surface detail and grain
          // ============================================
          if (orig.normalMap) {
            mat.normalMap = orig.normalMap;
            // Make normal map more prominent for visible grain/surface detail
            if (mat.normalScale) {
              mat.normalScale.set(2.5, 2.5); // Increased for more prominent normal map detail
            } else {
              // Create normalScale if it doesn't exist
              mat.normalScale = new THREE.Vector2(2.5, 2.5);
            }
          }
          if (orig.roughnessMap) mat.roughnessMap = orig.roughnessMap;
          if (orig.metalnessMap) mat.metalnessMap = orig.metalnessMap;
          
          // CRITICAL: Tag material as locked to metal system - prevents other systems from modifying it
          if (!mat.userData) mat.userData = {};
          mat.userData.__lockSystem = "METAL";
          
          mat.needsUpdate = true;
        }
      }
    });
  });
  
  // Also update artwork layers for silver
  if (normalizedColor === "brushed_silver") {
    model.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
          // CRITICAL FIX: Use mesh-name based detection only (not material properties)
          // This prevents false classification of other textured meshes as artwork
          const isArtworkLayerForSilver = isArtworkLayer(obj, mat);
          
          if (isArtworkLayerForSilver) {
            artworkLayerCount++;
            
            // ============================================
            // CRITICAL: Set render order - artwork must render AFTER metal
            // ============================================
            obj.renderOrder = 2; // Artwork layer renders after metal (on top)
            
            // ============================================
            // CRITICAL: Depth buffer control - prevent occlusion of metal behind transparent pixels
            // Artwork must respect depth but not write to it
            // ============================================
            mat.transparent = true; // Enable transparency for PNG alpha support
            mat.depthWrite = false; // Don't write to depth buffer - allows metal to show through alpha
            mat.depthTest = true; // CRITICAL FIX: Must respect depth for correct rendering order
            
            // ============================================
            // ARTWORK LAYER PROPERTIES - NON-METALLIC FOR VIBRANCY
            // ============================================
            
            // Reduced metalness to minimize light source reflections while keeping some
            // Low metalness (0.2) allows minimal light reflections without making artwork look dull
            if (mat.metalness !== undefined) {
              mat.metalness = 0.2; // Reduced from 0.55 - minimal light reflections
            }
            
            // Increased roughness for more matte appearance (reduces light reflections)
            // Higher roughness (0.7) makes artwork less reflective to light sources but not completely matte
            mat.roughness = 0.7; // Increased from 0.4 - reduces light reflections while maintaining vibrancy
            
            // Kill environment reflections WITHOUT removing envMap
            // Keep envMap intact for PBR (even if intensity is 0)
            // mat.envMap = null; // ❌ REMOVED - not needed, intensity = 0 is enough
            mat.envMapIntensity = finishPreset.envMapIntensityArtwork;
            
            // Kill specular reflections
            if ("specularIntensity" in mat) mat.specularIntensity = 0;
            if ("specularColor" in mat) mat.specularColor.setRGB(0, 0, 0);
            
            // Kill physical material reflection sources
            if (mat.isMeshPhysicalMaterial) {
              if ("clearcoat" in mat) mat.clearcoat = 0;
              if ("sheen" in mat) mat.sheen = 0;
              if ("reflectivity" in mat) mat.reflectivity = 0;
              if ("transmission" in mat) mat.transmission = 0;
              if ("thickness" in mat) mat.thickness = 0;
              if ("ior" in mat) mat.ior = 1.0;
              
              // Apply anisotropy from centralized finish preset
              if (mat.anisotropy !== undefined) mat.anisotropy = finishPreset.anisotropy;
              if (mat.anisotropyRotation !== undefined) mat.anisotropyRotation = 0.0;
            }
            
            // ============================================
            // BRIGHTEN ARTWORK LAYER (using emissiveMap - correct method)
            // ============================================
            // CRITICAL: Keep color neutral so texture remains accurate
            // Using color.setRGB(>1.0) multiplies texture and causes clipping/desaturation
            if (mat.color) {
              mat.color.setRGB(1.0, 1.0, 1.0); // Neutral - preserves texture colors
            }
            
            // Use texture as emissiveMap for texture-colored brightness boost
            // This preserves color ratios and prevents whitening
            if ("emissive" in mat && mat.map) {
              mat.emissive.setRGB(1.0, 1.0, 1.0); // Neutral white emissive base
              mat.emissiveMap = mat.map; // KEY: Use texture as emissive map (preserves colors)
              mat.emissiveIntensity = artworkBrightness; // 0.0-1.0 range (0.15-0.35 recommended)
              mat.toneMapped = true; // Keep tone mapping to prevent blowout
              
              // Ensure both maps use correct color space
              if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
              if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
            } else if ("emissive" in mat) {
              // No texture map - disable emissive
              mat.emissive.setRGB(0, 0, 0);
              mat.emissiveIntensity = 0.0;
              mat.emissiveMap = null;
            }
            
            // ============================================
            // CRITICAL: Ensure transparency is enabled for PNG alpha support
            // ============================================
            mat.transparent = true;
            mat.opacity = 1.0;
            mat.alphaTest = 0.08; // Higher threshold to remove white fringe pixels
            
            // DO NOT lock artwork layers - they should remain flexible for texture updates
            // Only true metal background meshes should be locked
            
            mat.needsUpdate = true;
          }
        }
      });
    });
  }
};

/**
 * DEPRECATED: Use applyMetalState() instead
 * Updates metal materials when environment map changes
 * This function now only sets envMap = null, all PBR properties come from applyMetalState()
 */
export const updateMetalMaterials = (model, envMap, showReflections, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;
  
  // Only set environment map - all PBR properties come from applyMetalState()
  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    
    if (isMetalBackLayer(obj)) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        applyMetalBackSettings(mat);
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
 * Updates metal materials when reflection intensity changes
 * This function does nothing - all properties come from applyMetalState()
 */
export const updateMetalReflectionIntensity = (model, reflectionIntensity, baseEnvMapIntensities) => {
  // DO NOTHING - All properties are handled by applyMetalState()
  return;
};

/**
 * DEPRECATED: Use applyMetalState() instead
 * Updates metal materials when metal finish changes
 * This function now just calls applyMetalState()
 */
export const updateMetalFinish = (model, metalFinish, metalColor = null) => {
  // Forward to the single source of truth function
  // Note: renderer is optional, but we need to get it from somewhere
  // For now, we'll call applyMetalState without renderer (it's optional)
  applyMetalState(model, null, {
    metalFinish,
    metalColor,
    showReflections: false,
    reflectionIntensity: 1.0
  });
};

/**
 * DEPRECATED: Use applyMetalState() instead
 * Updates metal materials when metal color changes
 */
export const updateMetalColor = (model, metalColor) => {
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
        // Update METAL role materials (high metalness) - use centralized preset
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
            // Brighten white metal for better visibility
            mat.color.multiplyScalar(1.6);
          } else {
            // For non-white metals, brighten color for better visibility
            mat.color.copy(color);
            mat.color.multiplyScalar(1.6); // Brighten by 60% for better visibility
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
 * Default lighting configuration for metal materials
 * Bright lighting for visibility with minimal reflections
 */
export const DEFAULT_LIGHTING = {
  exposure: 2.0, // Increased exposure for brighter appearance on matte metals
  ambient: 0.8, // Higher ambient for overall brightness
  key: 2.0, // Stronger key light
  fill: 0.6, // More fill light
  rim: 0.5, // More rim light
};

/**
 * Metal Material Lighting Controls Component
 * Uses LightingManager parent object for lighting state
 */
export const MetalLightingControls = ({ lightingManager, reflectionIntensity, onReflectionIntensityChange, metalFinish, onMetalFinishChange, metalColor, onMetalColorChange }) => {
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
          Select metal finish: Brushed Silver or Brushed White
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
          Adjust metal material roughness (polished = smooth, brushed = rough)
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
          Control overall reflection strength on metal surface
        </div>
      </div>
    </div>
  );
};
