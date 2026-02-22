import * as THREE from "three";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";

/**
 * USDZ export utility functions
 * Export-only material architecture (separate from Three.js runtime materials)
 */

// ============================================================================
// Texture Helpers
// ============================================================================

/**
 * Ensures color texture (map, emissiveMap) has correct sRGB color space
 * Does NOT mutate flipY (preserves original)
 */
function ensureColorTexture(tex) {
  if (!tex) return tex;
  // DON'T force flipY here - preserve original
  tex.colorSpace = THREE.SRGBColorSpace; // For newer Three.js
  // tex.encoding = THREE.sRGBEncoding; // For older Three.js (if colorSpace doesn't exist)
  tex.needsUpdate = true;
  return tex;
}

/**
 * Ensures data texture (normal, roughness, metalness, ao, etc.) has correct linear color space
 * Does NOT mutate flipY (preserves original)
 */
function ensureDataTexture(tex) {
  if (!tex) return tex;
  // DON'T force flipY here - preserve original
  tex.colorSpace = THREE.NoColorSpace; // linear / data
  tex.needsUpdate = true;
  return tex;
}

/**
 * Clones a texture for export use (deep clone to avoid mutating runtime textures)
 * ✅ USDZ-safe convention: force flipY = false for export (USDZExporter/QuickLook expects this)
 */
function cloneTexture(tex) {
  if (!tex) return null;
  const t = tex.clone();

  // ✅ USDZ-safe convention (do NOT mutate runtime textures)
  t.flipY = false;

  // ✅ CRITICAL: Keep export predictable - Quick Look hates inconsistent premult
  t.premultiplyAlpha = false; // ✅ keep export predictable (Quick Look hates inconsistent premult)
  t.colorSpace = tex.colorSpace; // keep whatever you set (we will enforce below)

  // Preserve wrap/repeat/rotation/offset
  t.wrapS = tex.wrapS;
  t.wrapT = tex.wrapT;
  t.repeat.copy(tex.repeat);
  t.offset.copy(tex.offset);
  t.center.copy(tex.center);
  t.rotation = tex.rotation;

  // Preserve filters
  t.minFilter = tex.minFilter;
  t.magFilter = tex.magFilter;
  t.generateMipmaps = tex.generateMipmaps;

  t.needsUpdate = true;
  return t;
}

/**
 * Deep clones a material with all its textures
 * Critical: prevents mutating shared texture objects that affect runtime scene
 */
function cloneMaterialWithClonedTextures(mat) {
  const m = mat.clone();

  const texProps = [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "aoMap",
    "emissiveMap",
    "alphaMap",
    "bumpMap",
    "displacementMap",
    "clearcoatMap",
    "clearcoatNormalMap",
    "clearcoatRoughnessMap",
  ];

  texProps.forEach((p) => {
    if (m[p]) m[p] = cloneTexture(m[p]); // real clone, not reference
  });

  return m;
}

/**
 * Bakes an RGBA texture's alpha channel onto a white background
 * This creates an opaque texture where transparent areas become white
 * Used for USDZ export to avoid Quick Look alpha corruption issues
 * @param {THREE.Texture} tex - Source texture with alpha channel
 * @returns {THREE.Texture} - New opaque texture with alpha baked to white
 */
function bakeTextureAlphaToWhite(tex) {
  if (!tex?.image) return tex;

  const img = tex.image;
  const w = img.width || img.videoWidth;
  const h = img.height || img.videoHeight;
  if (!w || !h) return tex;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d", { willReadFrequently: false });

  // Fill white first (this becomes your "super white" alpha area)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // Draw original image on top using its alpha
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(img, 0, 0, w, h);

  const baked = new THREE.CanvasTexture(canvas);
  baked.flipY = false;
  baked.colorSpace = THREE.SRGBColorSpace;
  baked.wrapS = tex.wrapS;
  baked.wrapT = tex.wrapT;
  baked.minFilter = THREE.LinearFilter;
  baked.magFilter = THREE.LinearFilter;
  baked.generateMipmaps = false;
  baked.needsUpdate = true;

  return baked;
}

/**
 * Bleeds alpha edges to eliminate white halos in transparent PNG areas
 * Copies RGB from nearest opaque pixels into transparent pixels
 * Used for cutout prints (WOOD, METAL_SILVER, MIRROR) to prevent white fringe
 * @param {THREE.Texture} tex - Source texture with alpha channel
 * @param {number} iterations - Number of bleed iterations (default: 6)
 * @returns {THREE.Texture} - New texture with alpha edges bled
 */
function bleedAlphaEdges(tex, iterations = 6) {
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

  // Simple iterative neighbor fill: copy RGB from nearest opaque pixels into transparent pixels
  for (let it = 0; it < iterations; it++) {
    const copy = new Uint8ClampedArray(data); // snapshot
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        const a = copy[i + 3];
        if (a > 0) continue; // Skip opaque pixels

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
          // keep alpha = 0
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const out = new THREE.CanvasTexture(canvas);
  out.flipY = false;
  out.colorSpace = THREE.SRGBColorSpace;
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  out.minFilter = THREE.LinearFilter;
  out.magFilter = THREE.LinearFilter;
  out.generateMipmaps = false;
  out.needsUpdate = true;
  return out;
}

/**
 * Hardens alpha channel to binary (0 or 255) for cutout prints in USDZ
 * This prevents semi-transparent pixels from blending with substrate in Quick Look
 * which causes local fading/muddiness, especially on metal substrates.
 * 
 * @param {THREE.Texture} tex - Input texture
 * @param {number} alphaThreshold - Alpha threshold (0-1, default 0.12)
 * @param {number} bleedIterations - Number of RGB bleed iterations (default 6)
 * @returns {THREE.Texture} New texture with hardened alpha
 */
function hardenAlphaForCutout(tex, alphaThreshold = 0.12, bleedIterations = 6) {
  if (!tex?.image) return tex;

  const img = tex.image;
  const w = img.width || img.videoWidth;
  const h = img.height || img.videoHeight;
  if (!w || !h) return tex;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const thresh255 = Math.floor(alphaThreshold * 255);

  // ✅ STEP 1: Un-premultiply RGB using alpha
  // This fixes "faded patches" where PNG RGB is already multiplied by alpha.
  // Quick Look shows premultiplied pixels harshly, especially on metal substrates.
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];

    // Only un-premultiply for partially transparent pixels
    if (a > 0 && a < 255) {
      const inv = 255 / a;
      data[i + 0] = Math.min(255, Math.round(data[i + 0] * inv));
      data[i + 1] = Math.min(255, Math.round(data[i + 1] * inv));
      data[i + 2] = Math.min(255, Math.round(data[i + 2] * inv));
    }
  }

  // ✅ STEP 2: Binary alpha (cutout mask)
  // Eliminates semi-transparent pixels that cause fading
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    data[i + 3] = a >= thresh255 ? 255 : 0;
  }

  ctx.putImageData(imageData, 0, 0);

  let outTex = new THREE.CanvasTexture(canvas);
  outTex.flipY = false;
  outTex.colorSpace = THREE.SRGBColorSpace;
  outTex.premultiplyAlpha = false; // ✅ Keep export predictable
  outTex.wrapS = tex.wrapS;
  outTex.wrapT = tex.wrapT;

  // ✅ CRITICAL: no mipmaps for cutout (mipmaps average with transparent pixels → fading)
  outTex.generateMipmaps = false;
  outTex.minFilter = THREE.LinearFilter;
  outTex.magFilter = THREE.LinearFilter;
  outTex.needsUpdate = true;

  // ✅ STEP 3: bleed RGB into fully transparent pixels (prevents fringe)
  outTex = bleedAlphaEdges(outTex, bleedIterations);

  // ✅ Keep the no-mipmap settings after bleedAlphaEdges (it may recreate the texture)
  outTex.generateMipmaps = false;
  outTex.minFilter = THREE.LinearFilter;
  outTex.magFilter = THREE.LinearFilter;
  outTex.needsUpdate = true;

  return outTex;
}

/**
 * Debug function to log alpha channel statistics
 * Helps identify semi-transparent pixels that cause "faded patches" in Quick Look
 * @param {THREE.Texture} tex - Texture to analyze
 * @param {string} label - Label for the log output
 */
function logAlphaStats(tex, label = "") {
  const img = tex?.image;
  if (!img) {
    console.log("[ALPHA STATS] No image", label);
    return;
  }
  const w = img.width || img.videoWidth;
  const h = img.height || img.videoHeight;
  if (!w || !h) {
    console.log("[ALPHA STATS] No dimensions", label);
    return;
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;

  let zero = 0, full = 0, semi = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) zero++;
    else if (a === 255) full++;
    else semi++;
  }
  const total = w * h;
  console.log(`[ALPHA STATS] ${label}`, {
    total,
    zeroPct: ((zero / total) * 100).toFixed(2) + "%",
    semiPct: ((semi / total) * 100).toFixed(2) + "%",
    fullPct: ((full / total) * 100).toFixed(2) + "%",
  });
}

/**
 * Makes alpha truly binary (0 or 255, no semi-transparency)
 * For METAL_SILVER, this guarantees no "faded patches" from semi-transparent blending
 * @param {THREE.Texture} tex - Input texture
 * @returns {THREE.Texture} Texture with binary alpha
 */
function binaryAlphaNoSemi(tex) {
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
 * Forces ALL materials in the object to MeshStandardMaterial (final USDZ sanitization)
 * This MUST run AFTER all role conversions and backface copies are added
 * Converts ANY non-Standard material (Physical, Basic, etc.) to Standard
 * This is the final safety net to catch any Physical materials that slipped through
 * @param {THREE.Object3D} obj - Object to sanitize
 */
function forceStandardEverywhere(obj) {
  obj.traverse((o) => {
    if (!o.isMesh || !o.material) return;

    const mats = Array.isArray(o.material) ? o.material : [o.material];

    const fixed = mats.map((mat) => {
      if (!mat) return mat;

      // If it is Physical (or not Standard), convert
      if (mat.isMeshPhysicalMaterial || !mat.isMeshStandardMaterial) {
        const m = new THREE.MeshStandardMaterial();

        // Copy "safe" maps
        if (mat.map) m.map = mat.map;
        if (mat.alphaMap) m.alphaMap = mat.alphaMap;
        if (mat.normalMap) m.normalMap = mat.normalMap;
        if (mat.roughnessMap) m.roughnessMap = mat.roughnessMap;
        if (mat.metalnessMap) m.metalnessMap = mat.metalnessMap;
        if (mat.aoMap) m.aoMap = mat.aoMap;
        if (mat.emissiveMap) m.emissiveMap = mat.emissiveMap;

        // Base params
        if (mat.color) m.color.copy(mat.color);
        m.metalness = typeof mat.metalness === "number" ? mat.metalness : 0.0;
        m.roughness = typeof mat.roughness === "number" ? mat.roughness : 0.8;

        // Alpha handling
        m.transparent = !!mat.transparent;
        m.opacity = typeof mat.opacity === "number" ? mat.opacity : 1.0;
        m.alphaTest = typeof mat.alphaTest === "number" ? mat.alphaTest : 0.0;

        // Emissive (needed for "vibrant print")
        if (mat.emissive) m.emissive.copy(mat.emissive);
        m.emissiveIntensity = typeof mat.emissiveIntensity === "number" ? mat.emissiveIntensity : 1.0;
        m.toneMapped = mat.toneMapped ?? true;

        // Depth settings
        m.depthWrite = mat.depthWrite !== undefined ? mat.depthWrite : true;
        m.depthTest = mat.depthTest !== undefined ? mat.depthTest : true;

        // Polygon offset
        if (mat.polygonOffset !== undefined) m.polygonOffset = mat.polygonOffset;
        if (mat.polygonOffsetFactor !== undefined) m.polygonOffsetFactor = mat.polygonOffsetFactor;
        if (mat.polygonOffsetUnits !== undefined) m.polygonOffsetUnits = mat.polygonOffsetUnits;

        // USDZ safe
        m.side = THREE.FrontSide;
        m.needsUpdate = true;
        return m;
      }

      // Already Standard: still force USDZ-safe side
      mat.side = THREE.FrontSide;
      mat.needsUpdate = true;
      return mat;
    });

    o.material = Array.isArray(o.material) ? fixed : fixed[0];
  });
}

/**
 * Converts any material to USDZ-safe MeshStandardMaterial
 * USDZExporter has issues with MeshPhysicalMaterial, especially with alpha
 * @param {THREE.Material} mat - Material to convert
 * @returns {THREE.MeshStandardMaterial} USDZ-safe standard material
 */
function toUSDZSafeStandard(mat) {
  if (!mat) return mat;

  // Already safe
  if (mat.isMeshStandardMaterial) {
    mat.side = THREE.FrontSide;
    return mat;
  }

  // Convert Physical -> Standard (USDZExporter hates Physical features)
  if (mat.isMeshPhysicalMaterial) {
    const m = new THREE.MeshStandardMaterial();

    // Copy core properties
    if (mat.color) m.color.copy(mat.color);
    m.metalness = mat.metalness ?? 0.0;
    m.roughness = mat.roughness ?? 0.8;

    // Copy maps
    if (mat.map) m.map = mat.map;
    if (mat.normalMap) m.normalMap = mat.normalMap;
    if (mat.roughnessMap) m.roughnessMap = mat.roughnessMap;
    if (mat.metalnessMap) m.metalnessMap = mat.metalnessMap;
    if (mat.aoMap) m.aoMap = mat.aoMap;
    if (mat.emissiveMap) m.emissiveMap = mat.emissiveMap;
    if (mat.emissive) m.emissive.copy(mat.emissive);
    m.emissiveIntensity = mat.emissiveIntensity ?? 1.0;
    if (mat.alphaMap) m.alphaMap = mat.alphaMap;

    // Copy alpha handling
    m.transparent = !!mat.transparent;
    m.opacity = mat.opacity ?? 1.0;
    m.alphaTest = mat.alphaTest ?? 0.0;

    // Copy depth settings
    m.depthWrite = mat.depthWrite !== undefined ? mat.depthWrite : true;
    m.depthTest = mat.depthTest !== undefined ? mat.depthTest : true;

    // Copy polygon offset
    if (mat.polygonOffset !== undefined) m.polygonOffset = mat.polygonOffset;
    if (mat.polygonOffsetFactor !== undefined) m.polygonOffsetFactor = mat.polygonOffsetFactor;
    if (mat.polygonOffsetUnits !== undefined) m.polygonOffsetUnits = mat.polygonOffsetUnits;

    // Force USDZ-safe
    m.side = THREE.FrontSide;
    m.needsUpdate = true;
    return m;
  }

  // Default: clone and force FrontSide
  const m = mat.clone();
  m.side = THREE.FrontSide;
  m.needsUpdate = true;
  return m;
}

/**
 * Splits RGB and Alpha into separate textures for USDZ cutout prints
 * This prevents Quick Look from interpreting RGBA edge pixels as "semi transparent color"
 * which causes "patchy fading" on metal substrates
 * @param {THREE.Texture} tex - Input texture with alpha
 * @param {number} alphaThreshold - Alpha threshold for hardening (0-1, default 0.12)
 * @returns {Object} Object with rgbTex (opaque RGB) and alphaTex (grayscale alpha mask)
 */
function splitRGBAndAlpha(tex, alphaThreshold = 0.12) {
  if (!tex?.image) return { rgbTex: tex, alphaTex: null };

  const img = tex.image;
  const w = img.width || img.videoWidth;
  const h = img.height || img.videoHeight;
  if (!w || !h) return { rgbTex: tex, alphaTex: null };

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const src = ctx.getImageData(0, 0, w, h);
  const d = src.data;

  // Build RGB (opaque) + alpha grayscale
  const rgb = ctx.createImageData(w, h);
  const aimg = ctx.createImageData(w, h);
  const thresh = Math.floor(alphaThreshold * 255);

  for (let i = 0; i < d.length; i += 4) {
    const A = d[i + 3];

    // RGB texture: force alpha=255 (opaque)
    rgb.data[i + 0] = d[i + 0];
    rgb.data[i + 1] = d[i + 1];
    rgb.data[i + 2] = d[i + 2];
    rgb.data[i + 3] = 255;

    // Alpha texture: harden to 0/255 (cutout)
    const hardA = A >= thresh ? 255 : 0;
    aimg.data[i + 0] = hardA;
    aimg.data[i + 1] = hardA;
    aimg.data[i + 2] = hardA;
    aimg.data[i + 3] = 255;
  }

  // RGB canvas
  const rgbCanvas = document.createElement("canvas");
  rgbCanvas.width = w;
  rgbCanvas.height = h;
  rgbCanvas.getContext("2d").putImageData(rgb, 0, 0);

  // Alpha canvas
  const aCanvas = document.createElement("canvas");
  aCanvas.width = w;
  aCanvas.height = h;
  aCanvas.getContext("2d").putImageData(aimg, 0, 0);

  const rgbTex = new THREE.CanvasTexture(rgbCanvas);
  rgbTex.flipY = false;
  rgbTex.colorSpace = THREE.SRGBColorSpace;
  rgbTex.premultiplyAlpha = false;
  rgbTex.wrapS = tex.wrapS;
  rgbTex.wrapT = tex.wrapT;
  rgbTex.generateMipmaps = false;
  rgbTex.minFilter = THREE.LinearFilter;
  rgbTex.magFilter = THREE.LinearFilter;
  rgbTex.needsUpdate = true;

  const alphaTex = new THREE.CanvasTexture(aCanvas);
  alphaTex.flipY = false;
  alphaTex.colorSpace = THREE.NoColorSpace; // data texture
  alphaTex.wrapS = tex.wrapS;
  alphaTex.wrapT = tex.wrapT;
  alphaTex.generateMipmaps = false;
  alphaTex.minFilter = THREE.LinearFilter;
  alphaTex.magFilter = THREE.LinearFilter;
  alphaTex.needsUpdate = true;

  return { rgbTex, alphaTex };
}

/**
 * Adds a USDZ-safe backface copy of a mesh (workaround for USDZ not supporting DoubleSide)
 * Creates a flipped duplicate mesh to make the original visible from both sides
 * @param {THREE.Mesh} mesh - The mesh to duplicate
 * @param {number} zOffset - Z-axis offset to separate planes and avoid z-fighting (default: 0.001)
 */
function addUSDZBackfaceCopy(mesh, zOffset = 0.001) {
  if (!mesh?.parent) return;
  if (mesh.userData?._usdzBackfaceAdded) return;

  // Clone mesh (geometry + material already on the clonedObject, so safe)
  const back = mesh.clone();
  back.name = `${mesh.name}_Backface`;

  // IMPORTANT: make sure we don't recurse / re-add
  back.userData = { ...(back.userData || {}), _usdzBackfaceCopy: true };
  mesh.userData = { ...(mesh.userData || {}), _usdzBackfaceAdded: true };

  // Flip it to face the opposite direction (no UV mirroring)
  back.rotation.y += Math.PI;

  // Separate planes slightly to avoid z-fighting
  mesh.position.z += zOffset;
  back.position.z -= zOffset;

  mesh.parent.add(back);
}

// ============================================================================
// Export Profiles (by product/material type)
// ============================================================================

const EXPORT_PROFILES = {
  ACRYLIC: {
    needsWhiteBakeForPrint: true,
    print: { emissive: 1.6, alphaMode: "opaque" }, // baked => no transparency, higher emissive for Quick Look
    cover: { enabled: true, opacity: 0.055 },
    substrate: { type: "none" },
  },

  METAL_SILVER: {
    needsWhiteBakeForPrint: false,
    print: { emissive: 0.25, alphaMode: "cutout", alphaTest: 0.12 }, // ✅ Quick Look compensation - stabilizes brightness without looking "glowy"
    // NOTE: baseColor is IGNORED - original material color from MetalMaterial is always preserved
    substrate: { metalness: 1.0, roughness: 0.14, baseColor: new THREE.Color(0.85, 0.85, 0.87) }, // baseColor ignored, kept for reference
    cover: { enabled: false },
  },

  METAL_SILVER_BOX: {
    needsWhiteBakeForPrint: false,
    print: { emissive: 0.25, alphaMode: "cutout", alphaTest: 0.12 }, // ✅ Quick Look compensation - stabilizes brightness without looking "glowy"
    // NOTE: baseColor is IGNORED - original material color from MetalMaterial is always preserved
    substrate: { metalness: 1.0, roughness: 0.14, baseColor: new THREE.Color(0.85, 0.85, 0.87) }, // baseColor ignored, kept for reference
    cover: { enabled: false },
  },

  METAL_WHITE: {
    needsWhiteBakeForPrint: true,                 // ✅ Same as acrylic: bake alpha to white
    print: { emissive: 1.6, alphaMode: "opaque" }, // ✅ Same as acrylic: opaque, vibrant
    substrate: { type: "matte_white" },          // ✅ Matte white base (NOT metal, NOT emissive)
    cover: { enabled: false },                   // ✅ No gloss cover
  },

  METAL_WHITE_BOX: {
    needsWhiteBakeForPrint: true,                 // ✅ Same as acrylic: bake alpha to white
    print: { emissive: 1.6, alphaMode: "opaque" }, // ✅ Same as acrylic: opaque, vibrant
    substrate: { type: "matte_white" },          // ✅ Matte white base (NOT metal, NOT emissive)
    cover: { enabled: false },                   // ✅ No gloss cover
  },

  WOOD: {
    needsWhiteBakeForPrint: false,
    // Masked cutout for WOOD - reveals wood substrate texture behind
    print: { emissive: 0.8, alphaMode: "cutout", alphaTest: 0.05 },
    // Keep substrate with wood grain texture (not flat color)
    substrate: { metalness: 0.0, roughness: 0.95 },
    cover: { enabled: false },
  },

  MIRROR: {
    needsWhiteBakeForPrint: false,
    print: { emissive: 1.2, alphaMode: "cutout", alphaTest: 0.12 }, // slightly higher helps with fringe
    substrate: { metalness: 1.0, roughness: 0.05 },
    cover: { enabled: false },
  },
};

/**
 * Maps material type to export profile type
 * Handles both display types (METAL_SILVER) and internal types (METAL with metalColor)
 * IMPORTANT: Uses metalColor (white/brushed_silver), NOT metalFinish (brushed/polished)
 * @param {string} materialType - Material type (e.g., "METAL", "WOOD", "ACRYLIC")
 * @param {string} metalColor - Metal color ("white" or "brushed_silver")
 * @returns {string|null} - Export type or null if not found
 */
export function getExportType(materialType, metalColor = null) {
  // Handle display types directly
  if (EXPORT_PROFILES[materialType]) {
    return materialType;
  }

  // Map internal types to export types
  // Use metalColor to determine white vs silver (not metalFinish)
  // ✅ Bulletproof: normalize metalColor to handle various formats (case-insensitive, variants)
  const mc = (metalColor ?? "").toString().trim().toLowerCase();

  const isWhite = (
    mc === "white" ||
    mc === "metal_white" ||
    mc === "white_metal" ||
    mc === "whitemetal" ||
    mc === "metalwhite" ||
    mc.includes("white") // Safe fallback if you ever pass "white-polished", etc.
  );

  const typeMap = {
    ACRYLIC: "ACRYLIC",
    METAL: isWhite ? "METAL_WHITE" : "METAL_SILVER",
    METAL_BOX: isWhite ? "METAL_WHITE_BOX" : "METAL_SILVER_BOX",
    WOOD: "WOOD",
    MIRROR: "MIRROR",
  };

  return typeMap[materialType] || null; // Return null instead of defaulting to ACRYLIC
}

// ============================================================================
// Role Detection (universal across all product types)
// ============================================================================

/**
 * Detects mesh role based on name and structure
 * Uses explicit naming patterns to avoid misclassification
 * Returns: "PRINT" | "SUBSTRATE" | "COVER" | "BACK" | "OTHER"
 */
function getExportRole(mesh) {
  if (!mesh || !mesh.name) return "OTHER";

  const name = mesh.name.toLowerCase();
  const nameExact = mesh.name;

  // PRINT: Artwork meshes (exact names or with acrylic base child)
  const hasAcrylicBaseChild =
    mesh.children && mesh.children.some(c => c.userData?.isAcrylicEmissiveBase);
  const isPrint =
    hasAcrylicBaseChild ||
    nameExact === "Artwork_FullBleed" ||
    nameExact === "Artwork_Shrunk";

  if (isPrint) return "PRINT";

  // COVER: Glass/acrylic cover layers (exact name match for Glass)
  const isCover = nameExact === "Glass" || name === "glass";

  if (isCover) return "COVER";

  // BACK: Backing layers (exact names or pattern)
  const isBack =
    nameExact === "Acrylic_Back" ||
    nameExact === "Mirror_Back" ||
    nameExact === "Wood_Back" ||
    nameExact === "Metal_Back" ||
    nameExact === "Metal_Box_Silver_Back" ||
    nameExact === "Metal_Box_White_Back" ||
    (name.includes("back") && !name.includes("fullbleed") && !name.includes("shrunk"));

  if (isBack) return "BACK";

  // SUBSTRATE: Metal/wood/mirror base meshes (exact naming patterns)
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
    // Pattern-based fallback (more specific than before)
    (name.includes("silver") && (name.includes("fullbleed") || name.includes("shrunk"))) ||
    (name.includes("whitemetal") && (name.includes("fullbleed") || name.includes("shrunk"))) ||
    (name.includes("wood") && (name.includes("fullbleed") || name.includes("shrunk"))) ||
    (name.includes("mirror") && (name.includes("fullbleed") || name.includes("shrunk")));

  if (isSubstrate) return "SUBSTRATE";

  return "OTHER";
}

// ============================================================================
// USDZ-Safe Material Builders
// ============================================================================

/**
 * Creates USDZ-safe print material based on profile
 * @param {THREE.Texture} mapTex - Texture map
 * @param {Object} profile - Export profile
 * @param {string} exportType - Export type (for METAL_WHITE matte roughness)
 */
function makePrintMaterial(mapTex, profile, exportType = null) {
  const p = profile.print;

  // ✅ Force neutral PRINT properties for color-accurate artwork in Quick Look
  // Matte paper-like roughness keeps colors consistent (Quick Look darkens prints when they behave like shiny PBR)
  const matteRoughness =
    exportType === "METAL_WHITE" || exportType === "METAL_WHITE_BOX"
      ? 0.9 // Matte paper-like finish
      : exportType?.startsWith("METAL_")
      ? 0.85 // ✅ Matte paper-like for metals (0.85-0.95 range keeps colors stable)
      : 0.65; // Standard clarity for other materials

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(1, 1, 1), // ✅ Neutral - don't tint
    map: mapTex ? ensureColorTexture(mapTex) : null,
    metalness: 0.0, // ✅ Non-metallic for stable colors
    roughness: matteRoughness, // ✅ Matte paper-like keeps colors consistent
    envMapIntensity: 0.0, // ✅ No environment reflections affecting print
  });

  // ✅ Remove all PBR maps that could affect color accuracy
  mat.normalMap = null;
  mat.roughnessMap = null;
  mat.metalnessMap = null;
  mat.aoMap = null;

  // "unlit clarity" trick (works great in QuickLook)
  if (p.emissive > 0 && mat.map) {
    mat.emissive = new THREE.Color(1, 1, 1);
    mat.emissiveMap = mat.map;
    mat.emissiveIntensity = p.emissive;
    mat.toneMapped = true; // ✅ Keep tone mapping to prevent blowout
  }

  if (p.alphaMode === "opaque") {
    mat.transparent = false;
    mat.opacity = 1.0;
    mat.alphaTest = 0.0;
    mat.depthWrite = true;
    mat.depthTest = true;
  } else if (p.alphaMode === "blend") {
    mat.transparent = true;
    mat.opacity = 1.0;
    mat.alphaTest = 0.0; // IMPORTANT: no cutout - use smooth blending
    mat.depthWrite = false; // IMPORTANT: avoid sorting artifacts with substrate behind
    mat.depthTest = true;
  } else if (p.alphaMode === "cutout") {
    // MASKED cutout: alphaTest discards pixels (reveals substrate behind)
    // ✅ CRITICAL: transparent=true ensures exporter/Quick Look exports opacity properly
    // This stops the metal layer from "participating" in shading behind pixels that should be fully print
    mat.transparent = true; // ✅ exporter/Quick Look exports opacity properly
    mat.opacity = 1.0;
    mat.alphaTest = p.alphaTest ?? 0.12;

    // ✅ CRITICAL FIX: depthWrite MUST be true for cutout prints in USDZ
    // USDZ/Quick Look does not respect Three.js renderOrder, so depthWrite is the only
    // reliable layering control. Discarded pixels (alpha holes) don't write depth anyway,
    // so holes still show substrate correctly, but opaque pixels now properly "own" depth.
    mat.depthWrite = true; // ✅ print owns depth where alpha passes - prevents substrate shading contamination
    mat.depthTest = true; // still test depth so it sits correctly
    
    // ✅ Add polygonOffset to prevent micro z-fighting with nearly coplanar substrate
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -1;
  }

  // Keep materials single-sided (FrontSide) - USDZ doesn't support DoubleSide
  // For WOOD, we duplicate the mesh as a backface copy instead
  mat.side = THREE.FrontSide;
  mat.needsUpdate = true;

  return mat;
}

/**
 * Creates USDZ-safe substrate material based on profile
 */
function makeSubstrateMaterial(profile) {
  const s = profile.substrate;
  if (!s || s.type === "none") return null;

  // ✅ Matte white substrate (for METAL_WHITE - non-emissive, just matte white)
  if (s.type === "matte_white") {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(1, 1, 1),
      metalness: 0.0,     // ✅ NOT metal
      roughness: 1.0,     // ✅ Fully matte
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide,
    });

    mat.map = null;
    mat.normalMap = null;
    mat.roughnessMap = null;
    mat.metalnessMap = null;
    mat.aoMap = null;

    mat.needsUpdate = true;
    return mat;
  }

  // ✅ Acrylic-like white emissive substrate (legacy, kept for compatibility)
  if (s.type === "emissive_white") {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(1.0, 1.0, 1.0), // Pure white
      emissive: new THREE.Color(1.0, 1.0, 1.0), // Pure white emissive
      emissiveIntensity: s.emissiveIntensity ?? 1.5, // Higher intensity for bright white base (like acrylics)
      metalness: 0.0, // ✅ CRITICAL: Non-metallic (paper-like, not metal)
      roughness: 1.0, // ✅ CRITICAL: Fully matte (paper-like, not metal)
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide,
    });
    // ✅ CRITICAL: Remove any PBR maps that could make it look metallic
    mat.map = null; // No color map (pure white)
    mat.normalMap = null; // No normal map (flat surface)
    mat.roughnessMap = null; // No roughness map (uniform matte)
    mat.metalnessMap = null; // No metalness map (non-metallic)
    mat.aoMap = null; // No AO map (clean white)
    mat.needsUpdate = true;
    return mat;
  }

  // ✅ Better silver base (slightly grey) - use baseColor from profile if provided
  const baseColor =
    s.baseColor instanceof THREE.Color
      ? s.baseColor
      : new THREE.Color(0.85, 0.85, 0.87);

  const mat = new THREE.MeshStandardMaterial({
    color: baseColor,
    metalness: s.metalness ?? 1.0,
    roughness: s.roughness ?? 0.18,
    transparent: false,
    opacity: 1.0,
    depthWrite: true,
    depthTest: true,
    side: THREE.FrontSide,
  });

  mat.needsUpdate = true;
  return mat;
}

/**
 * Creates USDZ-safe cover material based on profile
 */
function makeCoverMaterial(profile) {
  const c = profile.cover;
  if (!c?.enabled) return null;

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(1, 1, 1),
    transparent: true,
    opacity: c.opacity ?? 0.055,
    metalness: 0.0,
    roughness: 0.05,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
  });

  mat.needsUpdate = true;
  return mat;
}

/**
 * Export model to USDZ format and return as Blob
 * @param {THREE.Object3D} model - Model to export
 * @param {Object} options - Export options
 * @returns {Promise<Blob>} - USDZ file as Blob
 */
export async function exportModelToUSDZBlob(model, options = {}) {
  if (!model) {
    throw new Error("No model provided for export");
  }

  // Get export profile from options
  // Supports both explicit exportType and materialType + metalColor mapping
  // IMPORTANT: Use metalColor (white/brushed_silver), NOT metalFinish (brushed/polished)
  let exportType = options.exportType;
  
  if (!exportType && options.materialType) {
    exportType = getExportType(options.materialType, options.metalColor);
  }
  
  // Warn if white-ish metalColor is passed but exportType is not METAL_WHITE
  const mc = (options.metalColor ?? "").toString();
  if (options.materialType === "METAL" && !options.exportType) {
    if (mc.toLowerCase().includes("white") && exportType !== "METAL_WHITE" && exportType !== "METAL_WHITE_BOX") {
      console.warn("[USDZ EXPORT] ⚠️ You selected WHITE-ish metalColor, but exportType is not METAL_WHITE:", { 
        metalColor: mc, 
        exportType,
        note: "This usually means the metalColor value doesn't match expected format. Expected: 'white', 'White', 'metal_white', etc."
      });
    }
  }
  
  // Require explicit export type - don't silently default to ACRYLIC
  if (!exportType) {
    throw new Error(
      "[USDZ EXPORT] exportType missing. " +
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

  // Apply profile-based material conversion
  clonedObject.traverse((child) => {
    if (!child.isMesh || !child.material) return;

    // Skip backface copies (they're already processed)
    if (child.userData?._usdzBackfaceCopy) return;

    // Hide acrylic base layer in export (not needed when alpha is baked)
      if (child.userData && child.userData.isAcrylicEmissiveBase) {
      child.visible = false;
      return;
    }

    // Detect mesh role
    const role = getExportRole(child);

    // Apply profile-based material conversion based on role
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      const newMaterials = [];

      mats.forEach((mat) => {
      let newMat = null;

      if (role === "PRINT") {
        // Handle print material
        let tex = mat.map ? cloneTexture(mat.map) : null;
        
        // ✅ CRITICAL: Ensure exported artwork texture is sRGB AND not premultiplied
        // Quick Look darkens prints when color space is inconsistent or premult is wrong
        if (tex) {
          tex.colorSpace = THREE.SRGBColorSpace; // ✅ always for artwork
          tex.premultiplyAlpha = false; // ✅ keep export predictable
          tex.needsUpdate = true;
        }
        
        const willBake = !!(profile.needsWhiteBakeForPrint && tex);
        
        // ✅ For METAL_SILVER: use binary alpha (0 or 255, no semi-transparency)
        // This guarantees no "faded patches" from semi-transparent blending with silver
        if (tex && !willBake && (exportType === "METAL_SILVER" || exportType === "METAL_SILVER_BOX")) {
          // Make alpha truly binary (kills all semi-transparency)
          tex = binaryAlphaNoSemi(tex);
          // Bleed RGB into transparent pixels (helps edge RGB)
          tex = bleedAlphaEdges(tex, 6);
        } else if (tex && !willBake && profile.print.alphaMode === "cutout") {
          // For other cutout types (WOOD/MIRROR), use standard hardening
          tex = hardenAlphaForCutout(tex, profile.print.alphaTest ?? 0.12, 6);
        } else if (tex && !willBake) {
          // For non-cutout (blend mode), just bleed edges
          tex = bleedAlphaEdges(tex, 6);
        }
        
        if (willBake) {
          tex = bakeTextureAlphaToWhite(tex);
          // ✅ For baked textures (ACRYLIC, METAL_WHITE), ensure crisp "paper print" look
          // No mipmaps reduces subtle dark fringe + keeps crisp
          if (tex) {
            tex.generateMipmaps = false;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.needsUpdate = true;
          }
        }
        
        // ✅ CRITICAL: Always disable mipmaps for cutout prints (prevents "faded areas")
        // Mipmaps are a huge source of "some areas look faded", especially on fine detail
        // This applies to ALL cutout exports (metal/wood/mirror), not just WOOD
        if (profile.print.alphaMode === "cutout" && tex) {
          tex.generateMipmaps = false;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.needsUpdate = true;
        }
        
        // ✅ CRITICAL: For METAL_SILVER, use binary alpha + emissive-only unlit material
        // Binary alpha (0 or 255) guarantees no "faded patches" from semi-transparent blending
        // Emissive-only rendering ensures vibrant, stable colors unaffected by lighting
        if ((exportType === "METAL_SILVER" || exportType === "METAL_SILVER_BOX") && tex) {
          // Create emissive-only unlit material with binary alpha texture
          newMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0, 0, 0),        // ✅ kill diffuse
            map: tex,                               // ✅ binary alpha texture (already processed)
            emissive: new THREE.Color(1, 1, 1),
            emissiveMap: tex,                       // ✅ vibrant from emissive
            emissiveIntensity: 1.0,                // ✅ Full intensity for vibrant print (was 0.25)
            metalness: 0.0,
            roughness: 1.0,
            envMapIntensity: 0.0,
            transparent: true,
            opacity: 1.0,
            alphaTest: 0.5,                        // ✅ 0.5 for binary alpha (anything below is hole, above is solid)
            depthWrite: true,
            depthTest: true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
            side: THREE.FrontSide,
          });

          // ✅ No mipmaps anywhere (prevents averaging artifacts)
          if (newMat.map) { newMat.map.generateMipmaps = false; }
          if (newMat.emissiveMap) { newMat.emissiveMap.generateMipmaps = false; }

          newMat.toneMapped = true; // Keep tone mapping to prevent blowout
          newMat.needsUpdate = true;
        } else {
          // For other materials or if no texture, use standard makePrintMaterial
          newMat = makePrintMaterial(tex, profile, exportType);
        }
        
        // ✅ METAL_WHITE is now handled by profile (needsWhiteBakeForPrint: true, alphaMode: "opaque")
        // No special cutout logic needed - profile drives opaque print behavior like ACRYLIC
        
        child.renderOrder = 2; // Print renders above substrate
        
        // ✅ Apply backface copy for cutout types where we want substrate behind
        // USDZ doesn't support DoubleSide, so we duplicate the mesh as a workaround
        // This makes the artwork visible from both sides
        // ✅ NOT for METAL_* - backface copy causes double-blending with transparent cutouts
        // which creates "patchy fading" on metal substrates
        const needsCutoutBackface =
          exportType === "WOOD" ||
          exportType === "MIRROR"; // ✅ NOT metal - prevents double-blending artifacts

        if (needsCutoutBackface && profile.print.alphaMode === "cutout") {
          addUSDZBackfaceCopy(child, 0.001);
        }
        
        // ✅ Add print plane separation for all cutout types to avoid coplanar z-fighting
        if (profile.print.alphaMode === "cutout") {
          // Slightly increased separation to avoid coplanar z-fighting with substrate
          // (polygonOffset also helps, but separation is still needed)
          child.position.z += 0.0012;
        }
      } else if (role === "SUBSTRATE") {
        // ✅ For METAL_WHITE, create matte white substrate (non-emissive, non-metallic)
        if (exportType === "METAL_WHITE" || exportType === "METAL_WHITE_BOX") {
          // Create matte white base - completely non-metallic, non-emissive
          const subMat = makeSubstrateMaterial(profile);
          if (subMat) {
            newMat = subMat;
            child.renderOrder = 1; // Substrate renders first (behind artwork)
            // ✅ CRITICAL: Ensure substrate is visible and non-metallic
            child.visible = true;
            // ✅ CRITICAL: Force non-metallic properties (override any metal maps)
            newMat.metalness = 0.0;
            newMat.roughness = 1.0;
            newMat.color.setRGB(1.0, 1.0, 1.0);
            // Remove any metal-related maps that could make it look metallic
            newMat.normalMap = null;
            newMat.roughnessMap = null;
            newMat.metalnessMap = null;
            newMat.aoMap = null;
          } else {
            // Fallback: skip if no substrate material
            return;
          }
        } else if (exportType.startsWith("METAL_")) {
          // For other metals (SILVER), show substrate (cutout reveals it)
          child.visible = true;
        }
        
        if (exportType === "WOOD") {
          // ✅ Keep the original wood material (it contains the wood grain map)
          // DO NOT use makeSubstrateMaterial() which creates a flat color
          newMat = cloneMaterialWithClonedTextures(mat);

          // Force USDZ-safe PBR values (but KEEP map/texture)
          if (!newMat.isMeshStandardMaterial) {
            const standard = new THREE.MeshStandardMaterial();
            // Copy all texture maps if present
            if (newMat.map) standard.map = cloneTexture(newMat.map);
            if (newMat.normalMap) standard.normalMap = cloneTexture(newMat.normalMap);
            if (newMat.roughnessMap) standard.roughnessMap = cloneTexture(newMat.roughnessMap);
            if (newMat.metalnessMap) standard.metalnessMap = cloneTexture(newMat.metalnessMap);
            if (newMat.aoMap) standard.aoMap = cloneTexture(newMat.aoMap);
            newMat = standard;
          }

          newMat.color = new THREE.Color(1, 1, 1); // don't tint the wood texture
          newMat.metalness = 0.0;
          newMat.roughness = 0.95;

          newMat.transparent = false;
          newMat.opacity = 1.0;
          newMat.depthWrite = true;
          newMat.depthTest = true;
          newMat.side = THREE.FrontSide;

          // Ensure textures have correct color space
          if (newMat.map) ensureColorTexture(newMat.map);
          if (newMat.normalMap) ensureDataTexture(newMat.normalMap);
          if (newMat.roughnessMap) ensureDataTexture(newMat.roughnessMap);
          if (newMat.metalnessMap) ensureDataTexture(newMat.metalnessMap);
          if (newMat.aoMap) ensureDataTexture(newMat.aoMap);

          newMat.needsUpdate = true;
        } else if (exportType.startsWith("METAL_") && exportType !== "METAL_WHITE" && exportType !== "METAL_WHITE_BOX") {
          // ✅ Keep the original metal material (preserves textures, maps, PBR properties)
          // DO NOT use makeSubstrateMaterial() which creates a flat color
          // Exclude METAL_WHITE - substrate is hidden and should not be processed
          newMat = cloneMaterialWithClonedTextures(mat);

          // ✅ 1) Ensure it is MeshStandardMaterial (USDZ exporter likes this best)
          if (!newMat.isMeshStandardMaterial) {
            const standard = new THREE.MeshStandardMaterial();
            // Keep all maps (already cloned by cloneMaterialWithClonedTextures)
            standard.map = newMat.map || null;
            standard.normalMap = newMat.normalMap || null;
            standard.roughnessMap = newMat.roughnessMap || null;
            standard.metalnessMap = newMat.metalnessMap || null;
            standard.aoMap = newMat.aoMap || null;
            standard.alphaMap = newMat.alphaMap || null;
            
            // Keep base properties (will be clamped below)
            standard.color.copy(newMat.color || new THREE.Color(0.85, 0.85, 0.87));
            standard.metalness = typeof newMat.metalness === "number" ? newMat.metalness : 1.0;
            standard.roughness = typeof newMat.roughness === "number" ? newMat.roughness : 0.35;
            
            newMat = standard;
          }

          // ✅ 2) Export from ORIGINAL snapshot (MetalMaterial authority) - not mutated runtime
          // applyMetalState() mutates the runtime material (darkens silver, overrides roughness, etc.)
          // We want to export the canonical MetalMaterial look, not the darkened runtime result
          const orig = mat.userData?.__originalMetal;
          
          // Use original values from snapshot if available, otherwise fall back to current
          const metalnessExport = orig?.metalness ?? mat.metalness ?? newMat.metalness ?? 1.0;
          const roughnessExport = orig?.roughness ?? mat.roughness ?? newMat.roughness ?? 0.35;
          const colorExport = orig?.color ? orig.color.clone() : (mat.color?.clone() ?? new THREE.Color(0.85, 0.85, 0.87));
          
          newMat.metalness = metalnessExport;
          newMat.roughness = roughnessExport;
          newMat.color.copy(colorExport);

          // ✅ 3) USDZ-friendly clamps (Quick Look lighting makes high-roughness metals look dark/dead)
          // Keep it truly metallic
          newMat.metalness = Math.max(0.9, Math.min(1.0, newMat.metalness));
          // Avoid chalk - let maps do detail work
          newMat.roughness = Math.max(0.12, Math.min(0.65, newMat.roughness));
          
          // ✅ 4) Clamp color to USDZ-safe range (must be <= 1.0, no >1 RGB)
          newMat.color.r = Math.min(1.0, Math.max(0, newMat.color.r));
          newMat.color.g = Math.min(1.0, Math.max(0, newMat.color.g));
          newMat.color.b = Math.min(1.0, Math.max(0, newMat.color.b));
          
          // Special handling for white metal (use bright but <= 1.0)
          const metalColor = options.metalColor || "brushed_silver";
          if (metalColor === "white") {
            // ✅ USDZ-safe: clamp to <= 1.0 (don't use 2.5, 2.5, 2.5)
            newMat.color.setRGB(0.97, 0.97, 0.97); // Very light, but within 0..1
          }

          // ✅ 5) Stronger grain (since anisotropy is lost in USDZ)
          // USDZ doesn't support anisotropy, so normal map is critical for brushed look
          // Boost normalScale so grain actually shows up in QuickLook
          if (newMat.normalMap) {
            if (!newMat.normalScale) {
              newMat.normalScale = new THREE.Vector2(1, 1);
            }
            // Strong normal scale (2.5) helps grain show up - MetalMaterial sets this
            newMat.normalScale.set(2.5, 2.5);
          }

          // ✅ 6) Preserve specularity settings from MetalMaterial
          if ("specularIntensity" in newMat) {
            newMat.specularIntensity = mat.specularIntensity ?? 0.0;
          }
          if ("specularColor" in newMat && mat.specularColor) {
            newMat.specularColor.copy(mat.specularColor);
          } else if ("specularColor" in newMat) {
            newMat.specularColor.setRGB(0, 0, 0); // Black specular (matches MetalMaterial)
          }

          // ✅ 7) USDZ texture configuration
          // flipY is already set to false in cloneTexture(), but ensure color spaces are correct
          if (newMat.map) {
            ensureColorTexture(newMat.map);
            // flipY already false from cloneTexture
          }
          if (newMat.normalMap) {
            ensureDataTexture(newMat.normalMap);
            // flipY already false from cloneTexture
          }
          if (newMat.roughnessMap) {
            ensureDataTexture(newMat.roughnessMap);
            // flipY already false from cloneTexture
          }
          if (newMat.metalnessMap) {
            ensureDataTexture(newMat.metalnessMap);
            // flipY already false from cloneTexture
          }
          if (newMat.aoMap) {
            ensureDataTexture(newMat.aoMap);
            // flipY already false from cloneTexture
          }
          if (newMat.alphaMap) {
            ensureDataTexture(newMat.alphaMap);
            // flipY already false from cloneTexture
          }

          newMat.transparent = false;
          newMat.opacity = 1.0;
          newMat.depthWrite = true;
          newMat.depthTest = true;
          newMat.side = THREE.FrontSide;

          newMat.needsUpdate = true;
        } else {
          // Existing logic for MIRROR etc (use makeSubstrateMaterial)
          const subMat = makeSubstrateMaterial(profile);
          if (subMat) {
            newMat = subMat;
          } else {
            // Fallback: deep clone to avoid mutating runtime textures
            newMat = cloneMaterialWithClonedTextures(mat);
            if (newMat.side === THREE.DoubleSide) {
              newMat.side = THREE.FrontSide;
            }
          }
        }
        child.renderOrder = 1; // Substrate renders first
      } else if (role === "COVER") {
        // Handle cover material
        const coverMat = makeCoverMaterial(profile);
        if (coverMat) {
          newMat = coverMat;
          child.renderOrder = 3; // Cover renders on top
        } else {
          // Fallback: deep clone to avoid mutating runtime textures
          newMat = cloneMaterialWithClonedTextures(mat);
          if (newMat.side === THREE.DoubleSide) {
            newMat.side = THREE.FrontSide;
          }
        }
      } else if (role === "BACK") {
        // Back layers: deep clone to avoid mutating runtime textures
        newMat = cloneMaterialWithClonedTextures(mat);
        if (newMat.side === THREE.DoubleSide) {
          newMat.side = THREE.FrontSide;
        }
        // Reduce high emissive intensity for USDZ compatibility
        if (newMat.emissiveIntensity && newMat.emissiveIntensity > 1.0) {
          newMat.emissiveIntensity = Math.min(1.0, newMat.emissiveIntensity * 0.3);
        }
      } else {
        // Other meshes: deep clone to avoid mutating runtime textures
        newMat = cloneMaterialWithClonedTextures(mat);
        
        // Fix double-sided materials
        if (newMat.side === THREE.DoubleSide) {
          newMat.side = THREE.FrontSide;
        }

        // Reduce high emissive intensity for USDZ compatibility
        if (newMat.emissiveIntensity && newMat.emissiveIntensity > 1.0) {
          newMat.emissiveIntensity = Math.min(1.0, newMat.emissiveIntensity * 0.3);
        }

        // Convert transmission-based materials to opacity-based
        if (newMat.isMeshPhysicalMaterial && newMat.transmission > 0) {
          const standardMat = new THREE.MeshStandardMaterial();
          standardMat.color = newMat.color?.clone() || new THREE.Color(0xffffff);
          standardMat.roughness = newMat.roughness ?? 0.5;
          standardMat.metalness = newMat.metalness ?? 0.0;
          standardMat.transparent = true;
          standardMat.opacity = Math.max(0.2, 1.0 - newMat.transmission);

          // Copy textures with proper color space handling
          if (newMat.map) standardMat.map = ensureColorTexture(cloneTexture(newMat.map));
          if (newMat.normalMap) standardMat.normalMap = ensureDataTexture(cloneTexture(newMat.normalMap));
          if (newMat.roughnessMap) standardMat.roughnessMap = ensureDataTexture(cloneTexture(newMat.roughnessMap));
          if (newMat.metalnessMap) standardMat.metalnessMap = ensureDataTexture(cloneTexture(newMat.metalnessMap));
          if (newMat.aoMap) standardMat.aoMap = ensureDataTexture(cloneTexture(newMat.aoMap));
          if (newMat.emissiveMap) standardMat.emissiveMap = ensureColorTexture(cloneTexture(newMat.emissiveMap));
          if (newMat.alphaMap) standardMat.alphaMap = ensureDataTexture(cloneTexture(newMat.alphaMap));
          if (newMat.bumpMap) standardMat.bumpMap = ensureDataTexture(cloneTexture(newMat.bumpMap));

          newMat = standardMat;
        }
      }

      // Ensure textures have correct color space (only on cloned textures, safe to mutate)
      if (newMat) {
        // Color maps (sRGB)
        if (newMat.map) ensureColorTexture(newMat.map);
        if (newMat.emissiveMap) ensureColorTexture(newMat.emissiveMap);

        // Data maps (linear/NoColorSpace)
        if (newMat.normalMap) ensureDataTexture(newMat.normalMap);
        if (newMat.roughnessMap) ensureDataTexture(newMat.roughnessMap);
        if (newMat.metalnessMap) ensureDataTexture(newMat.metalnessMap);
        if (newMat.aoMap) ensureDataTexture(newMat.aoMap);
        if (newMat.alphaMap) ensureDataTexture(newMat.alphaMap);
        if (newMat.bumpMap) ensureDataTexture(newMat.bumpMap);

        newMat.needsUpdate = true;
      }

      newMaterials.push(newMat || mat);
    });

    // Assign new materials
      if (Array.isArray(child.material)) {
        child.material = newMaterials;
      } else {
        child.material = newMaterials[0] || child.material;
    }
  });

  // ✅ CRITICAL FINAL PASS: Force ALL materials to MeshStandardMaterial before export
  // This MUST run AFTER all role conversions and backface copies are added
  // USDZExporter can't represent MeshPhysicalMaterial features and Quick Look shades them differently
  // This is the final safety net to catch any Physical materials that slipped through
  forceStandardEverywhere(clonedObject);

  // ✅ Diagnostic: Count MeshPhysicalMaterial instances (should be 0)
  let physCount = 0;
  clonedObject.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const arr = Array.isArray(o.material) ? o.material : [o.material];
    arr.forEach((m) => { 
      if (m?.isMeshPhysicalMaterial) {
        physCount++;
        console.warn("[USDZ EXPORT] MeshPhysicalMaterial still present:", o.name, m.name);
      }
    });
  });
  
  if (physCount > 0) {
    console.warn("[USDZ EXPORT] MeshPhysicalMaterial count:", physCount, "(should be 0)");
  }

  // Create exporter
  const exporter = new USDZExporter();
  let arrayBuffer;

  try {
    if (typeof exporter.parseAsync === "function") {
      arrayBuffer = await exporter.parseAsync(clonedObject);
    } else if (typeof exporter.parse === "function") {
      const result = exporter.parse(clonedObject);
      if (result instanceof Promise) {
        arrayBuffer = await result;
      } else if (result instanceof ArrayBuffer || result instanceof Uint8Array) {
        arrayBuffer = result;
      } else if (typeof result === "string" && result.startsWith("data:")) {
        const response = await fetch(result);
        arrayBuffer = await response.arrayBuffer();
      } else {
        throw new Error("Unexpected result from parse");
      }
    } else {
      throw new Error("USDZExporter does not have parse or parseAsync method");
    }

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Export returned empty result");
    }

    // Validate ZIP signature
    const view = new Uint8Array(arrayBuffer);
    const zipSignature = view[0] === 0x50 && view[1] === 0x4b;
    if (!zipSignature && arrayBuffer.byteLength > 0) {
      throw new Error("USDZ export failed: File is not a valid ZIP format");
    }

    // Create and return blob
    const blob = new Blob([arrayBuffer], { type: "model/vnd.usdz+zip" });
    if (blob.size === 0) {
      throw new Error("Blob creation failed - file is empty");
    }

    return blob;
  } catch (error) {
    throw new Error(`USDZ export failed: ${error.message}`);
  }
}

/**
 * Export model to USDZ format and trigger download
 * @param {THREE.Object3D} model - Model to export
 * @param {string} filename - Output filename
 * @param {Object} options - Export options
 * @returns {Promise<void>}
 */
export async function exportModelToUSDZ(model, filename = "model.usdz", options = {}) {
  const blob = await exportModelToUSDZBlob(model, options);
  
  // Trigger download
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".usdz") ? filename : `${filename}.usdz`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
