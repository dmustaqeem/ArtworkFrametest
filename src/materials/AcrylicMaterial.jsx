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
    // Premium 5mm acrylic glass - optically clear, zero blur
    requiresPhysical: true, // Need MeshPhysicalMaterial for transmission
    transmission: 1.0, // Maximum transmission for pure glass transparency
    roughness: 0.0, // CRITICAL: Zero roughness for optical clarity (no transmission blur)
    metalness: 0.0,
    clearcoat: 1.0, // Maximum clearcoat for glossy finish
    clearcoatRoughness: 0.0, // CRITICAL: Zero for crisp highlights without blur
    ior: 1.49, // Index of refraction for acrylic (close to glass)
    thickness: 0.002, // Reduced thickness for less refractive distortion (2mm)
    envBase: 1.6, // Increased reflection intensity for brighter appearance
    renderOrder: 2, // Render on top of artwork (PRINT layer)
  },
  ACRYLIC: {
    // Acrylic material - similar to glass but slightly less transparent
    requiresPhysical: true,
    transmission: 0.98, // Very high transmission, almost pure glass
    roughness: 0.0, // CRITICAL: Zero roughness for optical clarity (no transmission blur)
    metalness: 0.0,
    clearcoat: 1.0, // Maximum clearcoat for glossy finish
    clearcoatRoughness: 0.0, // CRITICAL: Zero for crisp highlights without blur
    ior: 1.49, // Index of refraction for acrylic
    thickness: 0.002, // Reduced thickness for less refractive distortion (2mm)
    envBase: 1.6, // Increased reflection intensity for brighter appearance
    renderOrder: 2, // Render on top of artwork (PRINT layer)
  },
  BACK: {
    // Acrylic_Back layer - matte, non-reflective, bright (like Mirror_Back)
    requiresPhysical: false,
    metalness: 0.0,
    roughness: 0.8, // Mostly matte (like mirror back, not chalk-flat)
    envBase: 0.0, // No environment reflections
    clearcoat: 0.0,
    clearcoatRoughness: 1.0,
    specularIntensity: 0.0,
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

  // ✅ ADD THIS HERE (before GLASS detection)
  // Acrylic back should be classified as BACK role (not DEFAULT or GLASS)
  // Also check for Surfboard/Skateboard back meshes (these models are only used with Acrylic)
  if ((meshNameLower.includes("acrylic") && meshNameLower.includes("back")) ||
      ((meshNameLower.includes("surfboard") || meshNameLower.includes("skateboard")) && 
       (meshNameLower.includes("back") || meshNameLower.includes("rear")))) {
    return "BACK"; // Classify as BACK role for proper matte/bright settings
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

  // For PRINT role (artwork layer), reflective with clearcoat but colors stay sharp
  if (role === "PRINT") {
    // Enable tone mapping so exposure affects brightness
    // This allows the exposure slider to brighten the artwork
    updatedMat.toneMapped = true;

    // IMPORTANT: Use alphaTest instead of transparent to avoid transparent sorting instability
    // This keeps PNG cutouts working without causing z-fighting with the base layer
    updatedMat.transparent = false;  // Keep in opaque render pass
    updatedMat.opacity = 1.0;
    updatedMat.alphaTest = 0.001;   // Small alpha test for PNG cutouts (avoids blending)
    updatedMat.depthWrite = true;    // Write to depth buffer
    updatedMat.depthTest = true;     // Test depth

    // Keep base material properties for accurate colors
    if ("metalness" in updatedMat) updatedMat.metalness = 0.0; // Non-metallic to preserve colors
    
    // Low roughness base for some reflection, but clearcoat does most of the work
    if ("roughness" in updatedMat) updatedMat.roughness = 0.3; // Slight base reflection
    
    // Use scene.environment for HDR reflections
    updatedMat.envMap = null; // This makes it use scene.environment
    // envMapIntensity will be set by enforceAcrylicArtworkMatteGlassGlossy or can be set here
    // Default to moderate intensity - can be adjusted
    if ("envMapIntensity" in updatedMat && updatedMat.envMapIntensity === undefined) {
      updatedMat.envMapIntensity = 0.4; // Moderate intensity for visible but not overwhelming reflections
    }
    
    // Clearcoat for glossy HDR reflections without affecting base color
    if (updatedMat.isMeshPhysicalMaterial) {
      updatedMat.clearcoat = 1.0; // Maximum clearcoat for glossy reflections
      updatedMat.clearcoatRoughness = 0.0; // Zero for crisp HDR reflections
      updatedMat.transmission = 0.0; // No transmission
      updatedMat.thickness = 0.0;
      updatedMat.ior = 1.0;
    }
    
    // Remove any distortion maps that could affect color accuracy
    updatedMat.normalMap = null;
    updatedMat.bumpMap = null;
    updatedMat.displacementMap = null;

    // CRITICAL: Ensure texture map is visible and properly configured
    // Keep texture map unchanged - colors stay sharp
    if (updatedMat.map) {
      updatedMat.map.needsUpdate = true;
      // Ensure map is not null and is properly set
      if (!updatedMat.map.image) {
        // If texture image is missing, log a warning but don't break
      }
    }

    // Ensure white base color for artwork (BaseMaterial already does this, but ensure it)
    // This ensures texture colors are accurate
    if (updatedMat.color) {
      updatedMat.color.set(0xffffff);
    }
  }

  // For BACK role (Acrylic_Back), apply matte and bright settings
  if (role === "BACK") {
    applyAcrylicBackSettings(updatedMat);
  }

  // For GLASS role: visible but transparent, non-reflective, doesn't affect artwork
  if (role === "GLASS" && updatedMat.isMeshPhysicalMaterial) {
    // Very low opacity - just enough to see edges, minimal white overlay
    updatedMat.transparent = true;
    updatedMat.opacity = 0.05; // Very low opacity - visible at edges but minimal white tint

    // No transmission - no blur on artwork
    updatedMat.transmission = 0.0;
    updatedMat.thickness = 0.0;
    updatedMat.ior = 1.0;
    
    // No reflections at all
    updatedMat.envMap = null;
    updatedMat.envMapIntensity = 0.0;
    updatedMat.clearcoat = 0.0;
    updatedMat.clearcoatRoughness = 1.0;

    // Use a neutral, pure white base - but with very low opacity it won't tint much
    updatedMat.color.setRGB(1.0, 1.0, 1.0);

    // Matte - no specular highlights
    updatedMat.roughness = 1.0;
    updatedMat.metalness = 0.0;
    
    // Use alphaTest to make it only visible at edges/thicker areas
    updatedMat.alphaTest = 0.01; // Only render where alpha is above threshold
    
    // CRITICAL: Remove any normal/bump/displacement maps that could affect appearance
    updatedMat.normalMap = null;
    updatedMat.bumpMap = null;
    updatedMat.displacementMap = null;

    // Depth settings for proper rendering
    updatedMat.depthWrite = false; // Important for transparent materials
    updatedMat.depthTest = true;
    updatedMat.side = THREE.DoubleSide; // Visible from both sides
  }
  // For ACRYLIC role: keep true glass but with minimal distortion
  else if (role === "ACRYLIC" && updatedMat.isMeshPhysicalMaterial) {
    // Ensure transparency is enabled for transmission
    updatedMat.transparent = true;
    updatedMat.opacity = 1.0; // Full opacity, transparency comes from transmission

    // Use a neutral, pure white base for glass so it doesn't tint the artwork
    updatedMat.color.setRGB(1.0, 1.0, 1.0);

    // CRITICAL: Ensure zero roughness for optical clarity (no transmission blur)
    updatedMat.roughness = 0.0;
    updatedMat.clearcoatRoughness = 0.0;
    
    // CRITICAL: Remove any normal/bump/displacement maps that could distort/blur transmission
    updatedMat.normalMap = null;
    updatedMat.bumpMap = null;
    updatedMat.displacementMap = null;

    // Set attenuation for realistic light transmission (neutral white)
    updatedMat.attenuationColor = new THREE.Color(0xffffff);
    updatedMat.attenuationDistance = 1.0;
    
    // Reduce thickness for less refractive distortion
    updatedMat.thickness = 0.002;

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

  // ✅ CRITICAL FIX: Store base env intensity on the material itself (survives material replacement)
  // This ensures reflection intensity updates work correctly even after material replacement
  updatedMat.userData = updatedMat.userData || {};
  const baseFromPreset = typeof preset.envBase === "number" ? preset.envBase : 
                         (preset.envBase === undefined ? undefined : 1.0);
  if (baseFromPreset !== undefined) {
    updatedMat.userData.__baseEnvIntensity = baseFromPreset;
  }

  return updatedMat;
};

/**
 * Apply matte to artwork and glossy to glass based on mesh names
 * Artwork_FullBleed + Artwork_Shrunk + Acrylic_Back → matte + no reflections
 * Glass → glossy + reflective
 */
export function applyArtworkMatteGlassGlossy(model, envMap, reflectionIntensity = 1.0) {
  if (!model) return;

  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

    // -------------------------
    // ARTWORK + ACRYLIC_BACK => MATTE + NO REFLECTIONS
    // -------------------------
    const objName = obj.name || "";
    const objNameLower = objName.toLowerCase();
    const isArtworkFull =
      objName === "Artwork_FullBleed" ||
      objName === "Front_Art" ||
      (objNameLower.includes("artwork") &&
        (objNameLower.includes("fullbleed") || objNameLower.includes("full_bleed"))) ||
      (objNameLower === "front_art" || objNameLower === "frontart" || 
       (objNameLower.includes("front") && objNameLower.includes("art")));
    const isArtworkShrunk =
      objName === "Artwork_Shrunk" ||
      (objNameLower.includes("artwork") &&
        (objNameLower.includes("shrunk") || objNameLower.includes("shrink")));
    const isArtwork = isArtworkFull || isArtworkShrunk;
    const isAcrylicBack =
      objName === "Acrylic_Back" ||
      (objNameLower.includes("acrylic") && objNameLower.includes("back")) ||
      // Surfboard and Skateboard models are only used with Acrylic, so their back meshes should be treated as acrylicBack
      ((objNameLower.includes("surfboard") || objNameLower.includes("skateboard")) && 
       (objNameLower.includes("back") || objNameLower.includes("rear")));

    // ARTWORK: matte + no reflections (no emissive brightness)
    if (isArtwork) {
      // Set render order: artwork renders in middle (below glass, above base)
      obj.renderOrder = 1;
      
      mats.forEach((m) => {
        // keep texture map but kill all env reflections and specular highlights
        if ("metalness" in m) m.metalness = 0.0;
        if ("roughness" in m) m.roughness = 1.0;          // matte
        if ("envMapIntensity" in m) m.envMapIntensity = 0.0; // no env reflections
        // Remove clearcoat/specular style highlights
        if ("clearcoat" in m) m.clearcoat = 0.0;
        if ("clearcoatRoughness" in m) m.clearcoatRoughness = 1.0;
        if ("specularIntensity" in m) m.specularIntensity = 0.0;
        // Ensure no direct envMap is used on artwork
        m.envMap = null;
        // ✅ Lock artwork materials to prevent generic passes from overwriting
        m.userData = m.userData || {};
        m.userData.__lockSystem = "ACRYLIC";
        m.needsUpdate = true;
      });
      return;
    }

    // ACRYLIC_BACK: matte + no reflections + BRIGHT (like mirror back)
    if (isAcrylicBack) {
      mats.forEach((m) => {
        applyAcrylicBackSettings(m);
      });
      return;
    }

    // -------------------------
    // GLASS => GLOSSY + REFLECTIVE
    // -------------------------
    // Check for glass mesh (case-insensitive to handle "Glass", "glass", etc.)
    const isGlass = objNameLower === "glass" || objNameLower.includes("glass");
    if (isGlass) {
      // Set render order: glass renders on top (front)
      obj.renderOrder = 2;
      
      mats.forEach((m, idx) => {
        let pm = m;

        // upgrade to Physical for best glass response (only if not already)
        if (!(pm instanceof THREE.MeshPhysicalMaterial)) {
          const upgraded = new THREE.MeshPhysicalMaterial();
          THREE.MeshStandardMaterial.prototype.copy.call(upgraded, m);
          pm = upgraded;

          if (Array.isArray(obj.material)) obj.material[idx] = pm;
          else obj.material = pm;
        }

        // reflections
        // ✅ Use envMap if provided, otherwise use scene.environment (set envMap = null)
        if (envMap) {
          pm.envMap = envMap;
        } else {
          pm.envMap = null; // Will use scene.environment (set by EnvironmentManager)
        }
        // ✅ CRITICAL FIX: Use base intensity * reflectionIntensity, not just reflectionIntensity
        // Glass preset has envBase: 1.6, so use that as base
        const glassBase = pm.userData?.__baseEnvIntensity ?? 1.6;
        pm.envMapIntensity = glassBase * reflectionIntensity;
        // ✅ Ensure base is stored and material is locked for future updates
        pm.userData = pm.userData || {};
        pm.userData.__lockSystem = "ACRYLIC"; // ✅ Lock to prevent generic passes from overwriting
        pm.userData.__baseEnvIntensity = glassBase;

        // CRITICAL: Zero roughness for optical clarity (no transmission blur)
        pm.roughness = 0.0;
        pm.metalness = 0;

        // glass look - optically clear
        pm.transmission = 1.0;      // real glass
        pm.thickness = 0.002;       // Reduced thickness for less refractive distortion
        pm.ior = 1.49;

        // crisp highlights (zero roughness for no blur)
        pm.clearcoat = 1.0;
        pm.clearcoatRoughness = 0.0;
        
        // CRITICAL: Remove any normal/bump/displacement maps that could distort/blur transmission
        pm.normalMap = null;
        pm.bumpMap = null;
        pm.displacementMap = null;

        pm.needsUpdate = true;
      });
      return; // Glass processed, continue to next mesh
    }

    // -------------------------
    // OTHER MESHES (Base, etc.) => REFLECTIVE
    // -------------------------
    // Set render order: base and other meshes render at back
    obj.renderOrder = 0;
    
    // For other meshes (like "Base"), apply reflections
    // These should get environment reflections but not the special glass treatment
    mats.forEach((m) => {
      if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
        // Use envMap if provided, otherwise use scene.environment
        if (envMap) {
          m.envMap = envMap;
        } else {
          m.envMap = null; // Will use scene.environment (set by EnvironmentManager)
        }
        
        // Apply reflection intensity
        const baseIntensity = m.userData?.__baseEnvIntensity ?? 1.0;
        m.envMapIntensity = baseIntensity * reflectionIntensity;
        
        // Store base intensity for future updates
        m.userData = m.userData || {};
        m.userData.__baseEnvIntensity = baseIntensity;
        m.userData.__lockSystem = "ACRYLIC";
        
        m.needsUpdate = true;
      }
    });
  });
}

/**
 * Applies matte and bright settings to Acrylic_Back materials
 * Matches Mirror_Back approach: bright RGB with tone mapping enabled, mostly matte
 */
const applyAcrylicBackSettings = (mat) => {
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
  // This creates the bright white appearance without the "white layer" effect of emissive
  // Match Mirror_Back brightness (3.0, 3.0, 3.0) for consistency
  if (mat.color) {
    mat.color.setRGB(3.0, 3.0, 3.0); // Bright like mirror back (was 1.5, now matches Mirror_Back)
  }

  // CRITICAL: Keep tone mapping enabled (unlike old approach) - prevents blowout
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
 * Updates acrylic materials when environment map changes
 * This is called by the main component to update materials
 * IMPORTANT: Artwork meshes and Acrylic_Back are skipped to preserve matte properties
 */
export const updateAcrylicMaterials = (model, envMap, showReflections, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;

  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;

    // CRITICAL: Skip artwork layers and Acrylic_Back - they should stay matte with no reflections
    const objName = obj.name || "";
    const objNameLower = objName.toLowerCase();
    const isArtworkFull =
      objName === "Artwork_FullBleed" ||
      objName === "Front_Art" ||
      (objNameLower.includes("artwork") &&
        (objNameLower.includes("fullbleed") || objNameLower.includes("full_bleed"))) ||
      (objNameLower === "front_art" || objNameLower === "frontart" || 
       (objNameLower.includes("front") && objNameLower.includes("art")));
    const isArtworkShrunk =
      objName === "Artwork_Shrunk" ||
      (objNameLower.includes("artwork") &&
        (objNameLower.includes("shrunk") || objNameLower.includes("shrink")));
    const isArtwork = isArtworkFull || isArtworkShrunk;
    const isAcrylicBack =
      objName === "Acrylic_Back" ||
      (objNameLower.includes("acrylic") && objNameLower.includes("back")) ||
      // Surfboard and Skateboard models are only used with Acrylic, so their back meshes should be treated as acrylicBack
      ((objNameLower.includes("surfboard") || objNameLower.includes("skateboard")) && 
       (objNameLower.includes("back") || objNameLower.includes("rear")));

    // Skip ONLY artwork (keep matte/no reflections set elsewhere)
    if (isArtwork) return;

    // Acrylic_Back: force bright + matte + no reflections (like Mirror_Back)
    if (isAcrylicBack) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        applyAcrylicBackSettings(mat);
      });

      return; // IMPORTANT: don't let generic env logic touch it
    }


    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        // Use scene.environment (set by main component)
        mat.envMap = null;

        // ✅ CRITICAL FIX: Use userData first (survives material replacement), then fall back to Map
        const baseFromUserData = mat?.userData?.__baseEnvIntensity;
        const baseFromMap = baseEnvMapIntensities?.get ? baseEnvMapIntensities.get(mat) : undefined;
        const baseIntensity = typeof baseFromUserData === "number" ? baseFromUserData : baseFromMap;

        // For glass/acrylic materials, use higher intensity for glossy reflections
        // For print materials, use lower intensity to prevent color spillage
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
        } else {
          // ✅ Fallback: use preset defaults if base is missing
          // Glass/acrylic typically has envBase ~1.6, print ~undefined (preserve original)
          const fallbackBase = isGlassOrAcrylic ? 1.6 : (mat.envMapIntensity || 1.0);
          if (isGlassOrAcrylic) {
            mat.envMapIntensity = fallbackBase * 0.8 * reflectionIntensity;
          } else {
            mat.envMapIntensity = fallbackBase * 0.6 * reflectionIntensity;
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
 * IMPORTANT: Artwork meshes and Acrylic_Back are skipped to preserve matte properties
 */
export const updateAcrylicReflectionIntensity = (model, reflectionIntensity, baseEnvMapIntensities) => {
  if (!model) return;

  model.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;

    // CRITICAL: Skip artwork layers and Acrylic_Back - they should stay matte with no reflections
    const objName = obj.name || "";
    const objNameLower = objName.toLowerCase();
    const isArtwork = objName === "Artwork_FullBleed" || objName === "Artwork_Shrunk" ||
      objName === "Front_Art" ||
      (objNameLower === "front_art" || objNameLower === "frontart" || 
       (objNameLower.includes("front") && objNameLower.includes("art")));
    const isAcrylicBack = objName === "Acrylic_Back" || 
      (objNameLower.includes("acrylic") && objNameLower.includes("back")) ||
      // Surfboard and Skateboard models are only used with Acrylic, so their back meshes should be treated as acrylicBack
      ((objNameLower.includes("surfboard") || objNameLower.includes("skateboard")) && 
       (objNameLower.includes("back") || objNameLower.includes("rear")));

    if (isArtwork) return;

    if (isAcrylicBack) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        applyAcrylicBackSettings(mat);
      });

      return; // IMPORTANT: don't let generic env logic touch it
    }


    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
        // ✅ CRITICAL FIX: Use userData first (survives material replacement), then fall back to Map
        const baseFromUserData = mat?.userData?.__baseEnvIntensity;
        const baseFromMap = baseEnvMapIntensities?.get ? baseEnvMapIntensities.get(mat) : undefined;
        const baseIntensity = typeof baseFromUserData === "number" ? baseFromUserData : baseFromMap;

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
        } else {
          // ✅ Fallback: use preset defaults if base is missing
          // Glass/acrylic typically has envBase ~1.6, print ~undefined (preserve original)
          const fallbackBase = isGlassOrAcrylic ? 1.6 : (mat.envMapIntensity || 1.0);
          if (isGlassOrAcrylic) {
            mat.envMapIntensity = fallbackBase * 0.8 * reflectionIntensity;
          } else {
            mat.envMapIntensity = fallbackBase * 0.6 * reflectionIntensity;
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
  // Acrylic-only: default brightness for super-white backing layer
  // Using 1.5 for more emissive white appearance (emissiveIntensity, range 0.5-3.0)
  acrylicBase: 1.5,
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
