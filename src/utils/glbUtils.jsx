import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { getExportType } from "./usdzUtils.jsx";

/**
 * GLB export utility functions
 * Uses the same profile-based material conversion system as USDZ for consistency
 * 
 * Note: We import getExportType from usdzUtils to share the export type resolution logic
 * Material processing uses the same profiles and logic as USDZ for consistency
 */

// Re-export getExportType for convenience
export { getExportType };

// ============================================================================
// Helper Functions (GLB-specific versions, simplified from USDZ)
// ============================================================================

/**
 * Clones a texture for GLB export
 * ✅ Preserves full UV transform (rotation, center, matrix) for KHR_texture_transform compatibility
 */
function cloneTextureForGLB(tex) {
  if (!tex) return null;
  const t = tex.clone();

  // GLTF expects flipY false for typical WebGL-loaded textures
  t.flipY = false;

  // Preserve alpha behavior from source (don't force premultiply here)
  t.premultiplyAlpha = tex.premultiplyAlpha ?? false;

  // Preserve transform + wrapping
  t.wrapS = tex.wrapS;
  t.wrapT = tex.wrapT;
  t.repeat.copy(tex.repeat);
  t.offset.copy(tex.offset);

  // ✅ Missing pieces (important for KHR_texture_transform)
  t.center.copy(tex.center);
  t.rotation = tex.rotation;

  // Preserve matrix behavior
  t.matrixAutoUpdate = tex.matrixAutoUpdate;
  t.matrix.copy(tex.matrix);
  t.updateMatrix();

  // Preserve colorspace
  t.colorSpace = tex.colorSpace;

  t.needsUpdate = true;
  return t;
}

/**
 * Makes alpha truly binary (0 or 255, no semi-transparency) for GLB export
 */
function binaryAlphaNoSemiForGLB(tex) {
  if (!tex?.image) return tex;

  const img = tex.image;
  const w = img.width || img.videoWidth;
  const h = img.height || img.videoHeight;
  if (!w || !h) return tex;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // alpha = 0 if fully transparent, else 255 (kills all semi-transparency)
  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = (data[i + 3] === 0) ? 0 : 255;
  }

  ctx.putImageData(imageData, 0, 0);

  const out = new THREE.CanvasTexture(canvas);
  out.flipY = false;
  out.colorSpace = THREE.SRGBColorSpace;
  out.premultiplyAlpha = false;
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  out.generateMipmaps = false;
  out.minFilter = THREE.LinearFilter;
  out.magFilter = THREE.LinearFilter;
  out.needsUpdate = true;

  return out;
}

/**
 * Bleeds RGB into transparent pixels to prevent halos (simplified version)
 */
function bleedAlphaEdgesForGLB(tex, iterations = 6) {
  if (!tex?.image) return tex;

  const img = tex.image;
  const w = img.width || img.videoWidth;
  const h = img.height || img.videoHeight;
  if (!w || !h) return tex;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Simple iterative neighbor fill
  for (let it = 0; it < iterations; it++) {
    const copy = new Uint8ClampedArray(data);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        const a = copy[i + 3];
        if (a > 0) continue;

        // Look at 8 neighbors for any opaque pixel
        let best = -1;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const j = ((y + dy) * w + (x + dx)) * 4;
            if (copy[j + 3] > 0) {
              best = j;
              break;
            }
          }
          if (best !== -1) break;
        }

        if (best !== -1) {
          data[i + 0] = copy[best + 0];
          data[i + 1] = copy[best + 1];
          data[i + 2] = copy[best + 2];
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const out = new THREE.CanvasTexture(canvas);
  out.flipY = false;
  out.colorSpace = THREE.SRGBColorSpace;
  out.premultiplyAlpha = false;
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  out.generateMipmaps = false;
  out.minFilter = THREE.LinearFilter;
  out.magFilter = THREE.LinearFilter;
  out.needsUpdate = true;

  return out;
}

/**
 * Detects if a mesh is a box side or return edge (should not export with artwork texture)
 * ✅ Enhanced to catch more side mesh naming patterns
 */
function isBoxSideOrReturn(mesh) {
  if (!mesh || !mesh.name) return false;
  const n = mesh.name.toLowerCase();

  // Strong keywords for return edges
  const hits =
    n.includes("side") ||
    n.includes("return") ||
    n.includes("edge") ||
    n.includes("wrap") ||
    n.includes("fold") ||
    n.includes("rim") ||
    n.includes("border") ||
    n.includes("frame") ||
    n.includes("wall") ||
    n.includes("thickness") ||
    n.includes("depth") ||
    n.endsWith("_l") || n.endsWith("_r") ||
    n.endsWith("_left") || n.endsWith("_right") ||
    n.endsWith("_top") || n.endsWith("_bottom");

  // Also catch common "box parts" (directional meshes that aren't front/back)
  // Check for directional terms but exclude front/back panels
  const hasDirectional = n.includes("left") || n.includes("right") || n.includes("top") || n.includes("bottom");
  const isFrontOrBack = n.includes("front") || n.includes("back");
  const directional = hasDirectional && !isFrontOrBack;

  return hits || directional;
}

/**
 * Detects mesh role based on name (same logic as USDZ)
 * ✅ Updated to handle ACRYLIC_BASE meshes that should not be exported
 */
function getExportRole(mesh) {
  if (!mesh || !mesh.name) return "OTHER";

  const name = mesh.name.toLowerCase();
  const nameExact = mesh.name;

  // ✅ ACRYLIC: Acrylic emissive base helper meshes (must not export)
  if (mesh.userData?.isAcrylicEmissiveBase || 
      name.startsWith("acrylicbase_") || 
      nameExact.startsWith("AcrylicBase_")) {
    return "ACRYLIC_BASE";
  }

  // PRINT: Artwork meshes
  const hasAcrylicBaseChild = mesh.children && mesh.children.some(c => c.userData?.isAcrylicEmissiveBase);
  const isPrint = hasAcrylicBaseChild ||
    nameExact === "Artwork_FullBleed" ||
    nameExact === "Artwork_Shrunk";

  if (isPrint) return "PRINT";

  // COVER: Glass/acrylic cover layers
  const isCover = nameExact === "Glass" || name === "glass";
  if (isCover) return "COVER";

  // BACK: Backing layers
  const isBack = nameExact === "Acrylic_Back" ||
    nameExact === "Mirror_Back" ||
    nameExact === "Wood_Back" ||
    nameExact === "Metal_Back" ||
    (name.includes("back") && !name.includes("fullbleed") && !name.includes("shrunk"));
  if (isBack) return "BACK";

  // SUBSTRATE: Metal/wood/mirror base meshes
  const isSubstrate =
    nameExact === "Silver_FullBleed" ||
    nameExact === "Silver_Shrunk" ||
    nameExact === "WhiteMetal_FullBleed" ||
    nameExact === "WhiteMetal_Shrunk" ||
    nameExact === "Wood_FullBleed" ||
    nameExact === "Wood_Shrunk" ||
    nameExact === "Mirror_FullBleed" ||
    nameExact === "Mirror_Shrunk" ||
    nameExact === "Metal_White_FullBleed" ||
    nameExact === "Metal_White_Shrunk" ||
    nameExact === "Metal_Silver_FullBleed" ||
    nameExact === "Metal_Silver_Shrunk" ||
    (name.includes("silver") && (name.includes("fullbleed") || name.includes("shrunk"))) ||
    (name.includes("whitemetal") && (name.includes("fullbleed") || name.includes("shrunk"))) ||
    (name.includes("wood") && (name.includes("fullbleed") || name.includes("shrunk"))) ||
    (name.includes("mirror") && (name.includes("fullbleed") || name.includes("shrunk")));

  if (isSubstrate) return "SUBSTRATE";

  return "OTHER";
}

/**
 * Bakes texture alpha to white (for opaque prints)
 * ✅ REAL flatten: uses destination-over to fill transparent areas with white
 */
function bakeTextureAlphaToWhiteForGLB(tex) {
  if (!tex?.image) return tex;

  const img = tex.image;
  const w = img.width || img.videoWidth;
  const h = img.height || img.videoHeight;
  if (!w || !h) return tex;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  // 1) Draw the original image first
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  // 2) Flatten transparency onto white:
  // "destination-over" draws behind existing pixels, filling transparent areas.
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // Restore default composite
  ctx.globalCompositeOperation = "source-over";

  const baked = new THREE.CanvasTexture(canvas);
  baked.flipY = false;
  baked.colorSpace = THREE.SRGBColorSpace;
  baked.premultiplyAlpha = false;
  baked.wrapS = tex.wrapS;
  baked.wrapT = tex.wrapT;

  // ✅ no mipmaps for print clarity
  baked.generateMipmaps = false;
  baked.minFilter = THREE.LinearFilter;
  baked.magFilter = THREE.LinearFilter;

  baked.needsUpdate = true;
  return baked;
}

/**
 * Forces texture alpha channel to fully opaque (255) for baked prints
 * This ensures GLTF treats the texture as opaque, not transparent
 */
function forceTextureOpaqueAlpha(tex) {
  if (!tex?.image) return tex;

  const img = tex.image;
  const w = img.width || img.videoWidth;
  const h = img.height || img.videoHeight;
  if (!w || !h) return tex;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i + 3] = 255; // Force alpha to 255 (fully opaque)
  }
  ctx.putImageData(imageData, 0, 0);

  const out = new THREE.CanvasTexture(canvas);
  out.flipY = false;
  out.colorSpace = THREE.SRGBColorSpace;
  out.premultiplyAlpha = false;
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  out.generateMipmaps = false;
  out.minFilter = THREE.LinearFilter;
  out.magFilter = THREE.LinearFilter;
  out.needsUpdate = true;
  return out;
}

// Import profile structure (duplicated here to avoid circular dependency)
// This matches EXPORT_PROFILES from usdzUtils.jsx
const EXPORT_PROFILES = {
  ACRYLIC: {
    needsWhiteBakeForPrint: true,
    print: { emissive: 1.6, alphaMode: "opaque" },
    cover: { enabled: true, opacity: 0.055 },
    substrate: { type: "none" },
  },
  METAL_SILVER: {
    needsWhiteBakeForPrint: false,
    print: { emissive: 1.0, alphaMode: "cutout", alphaTest: 0.12 }, // ✅ Same emissive as USDZ for consistency
    substrate: { metalness: 1.0, roughness: 0.14 },
    cover: { enabled: false },
  },
  METAL_SILVER_BOX: {
    needsWhiteBakeForPrint: false,
    print: { emissive: 1.0, alphaMode: "cutout", alphaTest: 0.12 },
    substrate: { metalness: 1.0, roughness: 0.14 },
    cover: { enabled: false },
  },
  METAL_WHITE: {
    needsWhiteBakeForPrint: true,
    print: { emissive: 1.6, alphaMode: "opaque" },
    substrate: { type: "matte_white" },
    cover: { enabled: false },
  },
  METAL_WHITE_BOX: {
    needsWhiteBakeForPrint: true,
    print: { emissive: 1.6, alphaMode: "opaque" },
    substrate: { type: "matte_white" },
    cover: { enabled: false },
  },
  WOOD: {
    needsWhiteBakeForPrint: false,
    print: { emissive: 0.8, alphaMode: "cutout", alphaTest: 0.05 },
    substrate: { metalness: 0.0, roughness: 0.95 },
    cover: { enabled: false },
  },
  MIRROR: {
    needsWhiteBakeForPrint: false,
    print: { emissive: 1.2, alphaMode: "cutout", alphaTest: 0.12 },
    substrate: { metalness: 1.0, roughness: 0.05 },
    cover: { enabled: false },
  },
};

/**
 * Export model to GLB format and return as Blob
 * @param {THREE.Object3D} model - Model to export
 * @param {Object} options - Export options
 * @returns {Promise<Blob>} - GLB file as Blob
 */
export async function exportModelToGLBBlob(model, options = {}) {
  if (!model) {
    throw new Error("No model provided for export");
  }

  // Get export type (same logic as USDZ)
  let exportType = options.exportType;
  
  if (!exportType && options.materialType) {
    exportType = getExportType(options.materialType, options.metalColor);
  }
  
  // Warn if white-ish metalColor is passed but exportType is not METAL_WHITE
  const mc = (options.metalColor ?? "").toString();
  if (options.materialType === "METAL" && !options.exportType) {
    if (mc.toLowerCase().includes("white") && exportType !== "METAL_WHITE" && exportType !== "METAL_WHITE_BOX") {
      console.warn("[GLB EXPORT] ⚠️ You selected WHITE-ish metalColor, but exportType is not METAL_WHITE:", { 
        metalColor: mc, 
        exportType,
        note: "This usually means the metalColor value doesn't match expected format. Expected: 'white', 'White', 'metal_white', etc."
      });
    }
  }

  // Require explicit export type - same validation as USDZ
  if (!exportType) {
    throw new Error(
      "[GLB EXPORT] exportType missing. " +
      "Pass options.exportType (e.g., 'WOOD', 'METAL_SILVER', 'MIRROR') " +
      "or options.materialType + options.metalColor. " +
      "Received options: " + JSON.stringify(options)
    );
  }

  const profile = EXPORT_PROFILES[exportType];
  if (!profile) {
    throw new Error(
      `Unknown export type: ${exportType}. ` +
      `Supported types: ${Object.keys(EXPORT_PROFILES).join(", ")}`
    );
  }

  // Clone model to avoid modifying original
  const clonedObject = model.clone(true);

  // ✅ Apply profile-based material conversion (same as USDZ for consistency)
  // This ensures GLB exports have the same material properties as USDZ exports
  clonedObject.traverse((child) => {
    if (!child.isMesh || !child.material) return;

    // Detect mesh role (same logic as USDZ)
    const role = getExportRole(child);

    // ✅ ACRYLIC: never export the emissive base helper meshes (prevents z-fighting)
    if (exportType === "ACRYLIC" && role === "ACRYLIC_BASE") {
      child.visible = false;
      return;
    }

    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const newMaterials = [];

    // ✅ Track if we've already applied position.z offset for this mesh (prevents multiple offsets)
    const didApplyPrintPushRef = { value: false };

    mats.forEach((mat) => {
      let newMat = mat.clone();

      // ✅ BOX FIX: sides/returns should not keep the artwork map
      if ((exportType === "METAL_WHITE_BOX" || exportType === "METAL_SILVER_BOX") && isBoxSideOrReturn(child)) {
        newMat.map = null;
        newMat.alphaMap = null;
        newMat.emissiveMap = null;

        // Force it to behave like metal substrate (matte-ish)
        newMat.transparent = false;
        newMat.opacity = 1.0;
        newMat.alphaTest = 0.0;

        // White box sides: matte white
        if (exportType === "METAL_WHITE_BOX") {
          newMat.metalness = 0.0;
          newMat.roughness = 1.0;
          newMat.color.setRGB(1, 1, 1);
          newMat.envMapIntensity = 0.0;
        }

        // Silver box sides: metal
        if (exportType === "METAL_SILVER_BOX") {
          newMat.metalness = 1.0;
          newMat.roughness = 0.14;
          newMat.color.setRGB(1, 1, 1);
          newMat.envMapIntensity = 1.0; // or 0 if you want no reflections in export
        }

        // Clear PBR maps to prevent surprises
        newMat.normalMap = null;
        newMat.roughnessMap = null;
        newMat.metalnessMap = null;
        newMat.aoMap = null;

        newMat.needsUpdate = true;

        newMaterials.push(newMat);
        return;
      }

      // ✅ Ensure textures are ready and properly configured
      const textureMaps = [
        "map",
        "normalMap",
        "roughnessMap",
        "metalnessMap",
        "aoMap",
        "emissiveMap",
        "alphaMap",
        "bumpMap",
      ];

      textureMaps.forEach((mapName) => {
        if (newMat[mapName]) {
          const texture = newMat[mapName];
          texture.needsUpdate = true;
          // GLB uses standard texture orientation (flipY: false)
          texture.flipY = false;
          // Ensure proper color space
          if (mapName === "map" || mapName === "emissiveMap") {
            texture.colorSpace = THREE.SRGBColorSpace;
          } else {
            texture.colorSpace = THREE.NoColorSpace; // Data textures
          }
        }
      });

      // ✅ Apply profile-based material conversion based on role (same as USDZ)
      if (role === "PRINT") {
        // Handle print material
        let tex = newMat.map ? cloneTextureForGLB(newMat.map) : null;
        
        if (tex) {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.premultiplyAlpha = false;
          tex.needsUpdate = true;
        }

        // ✅ White box: baking makes side-wrap show up as opaque white.
        // Keep cutout instead (like silver), so the wrapped UVs on sides stay invisible.
        const disableBakeForWhiteBox = (exportType === "METAL_WHITE_BOX");
        const willBake = !!(profile.needsWhiteBakeForPrint && tex && !disableBakeForWhiteBox);

        // ✅ Bake alpha to white for opaque prints (ACRYLIC, METAL_WHITE)
        if (willBake && tex) {
          tex = bakeTextureAlphaToWhiteForGLB(tex);
          tex = forceTextureOpaqueAlpha(tex); // ✅ Force alpha to 255 for GLTF opaque mode
          
          // ✅ baked prints MUST be fully opaque in GLTF
          newMat.transparent = false;
          newMat.opacity = 1.0;
          newMat.alphaTest = 0.0;
        }

        // ✅ For METAL_SILVER: use binary alpha + edge bleeding
        if (tex && !willBake && (exportType === "METAL_SILVER" || exportType === "METAL_SILVER_BOX")) {
          // Make alpha truly binary (kills all semi-transparency)
          tex = binaryAlphaNoSemiForGLB(tex);
          // Bleed RGB into transparent pixels
          tex = bleedAlphaEdgesForGLB(tex, 6);
        }

        // ✅ WHITE BOX: treat print texture like silver to kill fringe pixels
        // White backgrounds are unforgiving - need stronger cleanup
        if (tex && exportType === "METAL_WHITE_BOX") {
          tex = binaryAlphaNoSemiForGLB(tex);   // remove semi-transparency
          tex = bleedAlphaEdgesForGLB(tex, 8);  // slightly stronger bleed than 6
        }

        // Apply print material properties based on profile
        newMat.map = tex;
        newMat.color.setRGB(1, 1, 1);
        newMat.metalness = 0.0;
        newMat.roughness = exportType === "METAL_WHITE" || exportType === "METAL_WHITE_BOX" ? 0.9 : 0.85;
        newMat.envMapIntensity = 0.0;
        newMat.normalMap = null;
        newMat.roughnessMap = null;
        newMat.metalnessMap = null;
        newMat.aoMap = null;

        // ✅ Apply alpha mode from profile ONLY when not baked
        // (baked prints are already forced to opaque above)
        // ✅ Skip for METAL_WHITE_BOX (we handle it explicitly below with cutout)
        if (!willBake && exportType !== "METAL_WHITE_BOX") {
          if (profile.print.alphaMode === "opaque") {
            newMat.transparent = false;
            newMat.opacity = 1.0;
            newMat.alphaTest = 0.0;
          } else if (profile.print.alphaMode === "cutout") {
            newMat.transparent = true;
            newMat.opacity = 1.0;
            newMat.alphaTest = profile.print.alphaTest ?? 0.12;
          }
        }

        // Apply emissive from profile
        if (profile.print.emissive > 0 && newMat.map) {
          newMat.emissive.setRGB(1, 1, 1);
          newMat.emissiveMap = newMat.map;
          newMat.emissiveIntensity = profile.print.emissive;
          newMat.toneMapped = true;
        }

        // ✅ For METAL_SILVER: apply emissive-only rendering (same as USDZ)
        if (exportType === "METAL_SILVER" || exportType === "METAL_SILVER_BOX") {
          newMat.color.setRGB(0, 0, 0); // Kill diffuse
          newMat.emissive.setRGB(1, 1, 1);
          newMat.emissiveMap = newMat.map;
          newMat.emissiveIntensity = 1.0; // Full intensity
          newMat.alphaTest = 0.5; // Binary alpha threshold
          newMat.depthWrite = true;
          newMat.depthTest = true;
        }

        // ✅ For METAL_WHITE_BOX: use cutout (like silver) to hide side-wrap
        // White substrate shows through alpha, preventing return-edge UV wrap from becoming visible
        if (exportType === "METAL_WHITE_BOX") {
          newMat.transparent = true;
          newMat.opacity = 1.0;
          
          // ✅ Tighten cutout to remove remaining fringe (white needs higher threshold)
          newMat.alphaTest = 0.12; // try 0.10–0.18 depending on PNGs
          
          // Cutout should write depth (prevents sorting artifacts)
          newMat.depthWrite = true;
          newMat.depthTest = true;
          
          // ✅ Use polygonOffset instead of position.z to prevent z-fighting shimmer
          newMat.polygonOffset = true;
          newMat.polygonOffsetFactor = -2;
          newMat.polygonOffsetUnits = -2;
          
          // Also clamp to avoid any accidental tiling
          if (newMat.map) {
            newMat.map.wrapS = THREE.ClampToEdgeWrapping;
            newMat.map.wrapT = THREE.ClampToEdgeWrapping;
            newMat.map.repeat.set(1, 1);
            newMat.map.offset.set(0, 0);
            newMat.map.needsUpdate = true;
          }
          
          // Keep emissive for brightness (like profile setting)
          if (newMat.map && profile.print.emissive > 0) {
            newMat.emissive.setRGB(1, 1, 1);
            newMat.emissiveMap = newMat.map;
            newMat.emissiveIntensity = profile.print.emissive;
            newMat.toneMapped = true;
          }
        }

        // ✅ Optional: force clamp on PRINT textures for BOX (prevents accidental tiling)
        if (exportType === "METAL_SILVER_BOX" && newMat.map) {
          newMat.map.wrapS = THREE.ClampToEdgeWrapping;
          newMat.map.wrapT = THREE.ClampToEdgeWrapping;
          newMat.map.repeat.set(1, 1);
          newMat.map.offset.set(0, 0);
          newMat.map.needsUpdate = true;
        }

        // ✅ ACRYLIC: prevent z-fighting with acrylic base / glass
        // Use polygonOffset instead of position.z (more reliable across exporters/viewers)
        if (exportType === "ACRYLIC") {
          newMat.depthWrite = true;
          newMat.depthTest = true;
          newMat.polygonOffset = true;
          newMat.polygonOffsetFactor = -1;
          newMat.polygonOffsetUnits = -1;
        }

        // ✅ METAL_WHITE: prevent z-fighting with substrate
        // ✅ FIX: Apply position.z offset once per mesh, not per material
        // ✅ METAL_WHITE_BOX uses polygonOffset instead (handled above), so skip position.z for it
        if (exportType === "METAL_WHITE" && !didApplyPrintPushRef.value) {
          child.position.z += 0.0012;
          didApplyPrintPushRef.value = true;
        }
        if (exportType === "METAL_WHITE" || exportType === "METAL_WHITE_BOX") {
          newMat.depthWrite = true;
          newMat.depthTest = true;
        }

        // Disable mipmaps for cutout prints
        if (!willBake && profile.print.alphaMode === "cutout" && newMat.map) {
          newMat.map.generateMipmaps = false;
          newMat.map.minFilter = THREE.LinearFilter;
          newMat.map.magFilter = THREE.LinearFilter;
        }
      } else if (role === "COVER") {
        // ✅ Handle glass cover for ACRYLIC
        if (exportType === "ACRYLIC") {
          // Simple, widely-compatible glass
          newMat.transparent = true;
          newMat.opacity = profile.cover?.opacity ?? 0.055;
          newMat.metalness = 0.0;
          newMat.roughness = 0.05;
          newMat.color.setRGB(1, 1, 1);
          newMat.depthWrite = false; // Important for transparent cover
          newMat.depthTest = true;
          newMat.map = null;
          newMat.emissiveMap = null;
          newMat.alphaMap = null;
        }
      } else if (role === "SUBSTRATE") {
        // ✅ For METAL_WHITE: create matte white substrate (same as USDZ)
        if (exportType === "METAL_WHITE" || exportType === "METAL_WHITE_BOX") {
          newMat.metalness = 0.0;
          newMat.roughness = 1.0;
          newMat.color.setRGB(1.0, 1.0, 1.0);
          newMat.normalMap = null;
          newMat.roughnessMap = null;
          newMat.metalnessMap = null;
          newMat.aoMap = null;
          
          // ✅ For METAL_WHITE_BOX: use polygonOffset instead of position.z to prevent z-fighting shimmer
          if (exportType === "METAL_WHITE_BOX") {
            newMat.polygonOffset = true;
            newMat.polygonOffsetFactor = 2;
            newMat.polygonOffsetUnits = 2;
          } else {
            // ✅ Push substrate slightly back so print is cleanly visible (for non-box white metal)
            child.position.z -= 0.0010;
          }
        }
      }

      newMaterials.push(newMat);
    });

    if (Array.isArray(child.material)) {
      child.material = newMaterials;
    } else {
      child.material = newMaterials[0] || child.material;
    }
  });

  // Create exporter
  const exporter = new GLTFExporter();
  
  // Export options
  const exportOptions = {
    binary: true, // Export as GLB (binary) instead of GLTF (JSON)
    trs: false, // Use matrix instead of position/rotation/scale
    // ✅ Export only what is actually visible (prevents FullBleed/Shrunk overlaps and z-fighting)
    onlyVisible: options.onlyVisible ?? true,
    ...options,
  };

  return new Promise((resolve, reject) => {
    exporter.parse(
      clonedObject,
      (result) => {
        try {
          if (result instanceof ArrayBuffer || result instanceof Uint8Array) {
            // Binary GLB format
            const blob = new Blob([result], { type: "model/gltf-binary" });
            resolve(blob);
          } else if (typeof result === "object" && result !== null) {
            // JSON GLTF format (shouldn't happen with binary: true, but handle it)
            const jsonString = JSON.stringify(result, null, 2);
            const blob = new Blob([jsonString], { type: "model/gltf+json" });
            resolve(blob);
          } else {
            reject(new Error("Unexpected export result format"));
          }
        } catch (error) {
          reject(new Error(`Failed to process export result: ${error.message}`));
        }
      },
      (error) => {
        reject(new Error(`GLB export failed: ${error.message || "Unknown error"}`));
      },
      exportOptions
    );
  });
}

/**
 * Export model to GLB format and trigger download
 * @param {THREE.Object3D} model - Model to export
 * @param {string} filename - Output filename
 * @param {Object} options - Export options
 * @returns {Promise<void>}
 */
export async function exportModelToGLB(model, filename = "model.glb", options = {}) {
  const blob = await exportModelToGLBBlob(model, options);
  
  // Trigger download
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  
  // Determine filename based on blob type
  if (blob.type === "model/gltf+json") {
    const gltfFilename = filename.endsWith(".gltf") ? filename : filename.replace(".glb", ".gltf");
    link.download = gltfFilename;
  } else {
    link.download = filename.endsWith(".glb") ? filename : `${filename}.glb`;
  }
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
