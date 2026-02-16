/**
 * Application Configuration
 * Centralized configuration for the Artwork Frame application
 */

// =========================
// APP MODE CONFIGURATION
// =========================
// Note: Demo mode has been removed. Only API test mode is available.

// =========================
// MODEL & ASSET PATHS
// =========================
export const MODEL_PATHS = {
  GLB: "/assets/models/Acrylic/Acrylic_450x675.glb",
  HDRI: "/assets/hdr/studio1.hdr",
  HDRI_MIRROR: "/assets/hdr/studio2.hdr", // Special HDRI for mirror materials
  TEST_IMAGES: {
    IMAGE_1: "/assets/frames/image4.png",
    IMAGE_2: "/assets/frames/Image5.png",
    FRAME_TEXTURE: "/assets/frames/1.1.png", // Texture for testing frames
  },
};

/**
 * Get HDRI path based on material type
 * @param {string} materialType - Material type
 * @returns {string} HDRI path
 */
export const getHDRIPath = (materialType) => {
  return materialType === "MIRROR" ? MODEL_PATHS.HDRI_MIRROR : MODEL_PATHS.HDRI;
};

/**
 * Material type mapping for API mode
 * Maps display types to internal types and metal finish
 */
export const MATERIAL_TYPE_MAP = {
  ACRYLIC: { internalType: "ACRYLIC", metalFinish: null },
  METAL_SILVER: { internalType: "METAL", metalFinish: "brushed_silver" },
  METAL_WHITE: { internalType: "METAL", metalFinish: "white" },
  METAL_BOX_SILVER: { internalType: "METAL_BOX", metalFinish: "brushed_silver" },
  METAL_BOX_WHITE: { internalType: "METAL_BOX", metalFinish: "white" },
  WOOD: { internalType: "WOOD", metalFinish: null },
  MIRROR: { internalType: "MIRROR", metalFinish: null },
};

/**
 * Orientation types
 */
export const ORIENTATION_TYPES = {
  PORTRAIT: "portrait",
  LANDSCAPE: "landscape",
};

/**
 * Get model path based on orientation and material type
 * @param {string} orientation - Orientation type ('portrait' or 'landscape')
 * @param {string} materialType - Material type (can be display type like METAL_SILVER or internal type like METAL)
 * @param {string} metalFinish - Optional metal finish (brushed_silver or white) - defaults to brushed_silver
 * @returns {string} Model path
 */
export const getModelPath = (orientation, materialType, metalFinish = "brushed_silver") => {
  // Validate orientation
  if (!orientation || (orientation !== ORIENTATION_TYPES.PORTRAIT && orientation !== ORIENTATION_TYPES.LANDSCAPE)) {
    throw new Error(`Invalid orientation: ${orientation}. Must be 'portrait' or 'landscape'`);
  }

  // Normalize orientation to match folder name (Potraits has typo in folder name)
  const orientationFolder = orientation === ORIENTATION_TYPES.PORTRAIT ? "Potraits" : "Landscape";
  
  // Check if it's a display type (has mapping)
  const materialMapping = MATERIAL_TYPE_MAP[materialType];
  
  let internalType = materialType;
  let finish = metalFinish;
  
  if (materialMapping) {
    internalType = materialMapping.internalType;
    finish = materialMapping.metalFinish || metalFinish;
  }
  
  // Map internal types to folder names
  const materialFolderMap = {
    ACRYLIC: "Acrylic",
    METAL: finish === "white" ? "Metal White" : "Metal Silver",
    METAL_BOX: finish === "white" ? "Metal White Box" : "Metal Silver Box",
    WOOD: "Wood",
    MIRROR: "Mirror",
  };
  
  const materialFolder = materialFolderMap[internalType] || materialFolderMap.ACRYLIC;
  
  // Map internal types to model file names
  const modelFileMap = {
    ACRYLIC: "Acrylic_450x675.glb",
    METAL: finish === "white" ? "Metal_White_450x675.glb" : "Metal_Silver_450x675.glb",
    METAL_BOX: finish === "white" ? "Metal_Box_White_450x675.glb" : "Metal_Box_Silver_450x675.glb",
    WOOD: "Wood_450x675.glb",
    MIRROR: "Mirror_450x675.glb",
  };
  
  const modelFile = modelFileMap[internalType] || modelFileMap.ACRYLIC;
  
  // Construct path: /assets/models/{orientation}/{materialFolder}/{modelFile}
  return `/assets/models/${orientationFolder}/${materialFolder}/${modelFile}`;
};

/**
 * Get internal material type and metal finish from display type
 * @param {string} displayType - Display material type (e.g., METAL_SILVER, METAL_WHITE)
 * @returns {object} { internalType, metalFinish }
 */
export const getMaterialTypeInfo = (displayType) => {
  const mapping = MATERIAL_TYPE_MAP[displayType];
  if (mapping) {
    return {
      internalType: mapping.internalType,
      metalFinish: mapping.metalFinish,
    };
  }
  // Fallback for internal types
  return {
    internalType: displayType,
    metalFinish: null,
  };
};

/**
 * Get display name for material type
 * @param {string} displayType - Display material type
 * @returns {string} Display name
 */
export const getMaterialTypeDisplayName = (displayType) => {
  const displayNames = {
    ACRYLIC: 'Acrylic',
    METAL_SILVER: 'Metal - Silver',
    METAL_WHITE: 'Metal - White',
    METAL_BOX_SILVER: 'Metal Box - Silver',
    METAL_BOX_WHITE: 'Metal Box - White',
    WOOD: 'Wood',
    MIRROR: 'Mirror',
  };
  return displayNames[displayType] || displayType;
};

// =========================
// MATERIAL CONFIGURATION
// =========================
export const MATERIAL_CONFIG = {
  DEFAULT_TYPE: "ACRYLIC",
  METAL_FINISH: "brushed_silver", // Options: "brushed_silver" | "white" | "gold"
  METAL_FINISH_OPTIONS: ["brushed_silver", "white", "gold"],
  // Color removal settings for metal and mirror materials
  REMOVE_COLOR: {
    ENABLED: true, // Set to false to disable color removal entirely
    COLOR: "#FFFFFF", // Color to remove (hex string or null for brightness threshold)
    TOLERANCE: 30, // Color matching tolerance (0-255) - increased for better white detection
  },
};

// =========================
// DEFAULT LIGHTING VALUES
// =========================
export const DEFAULT_LIGHTING = {
  exposure: 2.50,
  ambient: 0.50,
  key: 1.50,
  fill: 0.25,
  rim: 0.35,
  // Optional acrylic-only control: base brightness for super-white backing
  // Using 3.0 for super white and more emissive appearance (emissiveIntensity, range 0.5-5.0)
  acrylicBase: 3.0,
};

// =========================
// DEFAULT STATE VALUES
// =========================
export const DEFAULT_STATE = {
  envRotation: 0,
  reflectionIntensity: 0.2,
  metalFinish: "brushed", // Default to brushed for brushed silver metal
  showReflections: true,
  showLightingControls: false,
  showMeshControls: false,
  showTextureLayers: false,
};

/**
 * Get default reflection intensity based on material type
 * @param {string} materialType - Material type (ACRYLIC, MIRROR, etc.)
 * @returns {number} Default reflection intensity
 */
export const getDefaultReflectionIntensity = (materialType) => {
  // Acrylic uses 1.50 by default
  if (materialType === "ACRYLIC") {
    return 1.50;
  }
  // Mirror uses 0.50 by default
  if (materialType === "MIRROR") {
    return 0.50;
  }
  // All other materials use the standard default
  return DEFAULT_STATE.reflectionIntensity;
};

// =========================
// SCENE CONFIGURATION
// =========================
export const SCENE_CONFIG = {
  camera: {
    fov: 60,
    near: 0.1,
    far: 1000,
    initialPosition: { x: 0, y: 0.6, z: 3.5 },
  },
  renderer: {
    toneMapping: "ACESFilmicToneMapping", // THREE.ACESFilmicToneMapping
    outputColorSpace: "SRGBColorSpace", // THREE.SRGBColorSpace
    antialias: true,
    alpha: true,
  },
  model: {
    scaleFactor: 2.5,
  },
};

// =========================
// UI CONFIGURATION
// =========================
export const UI_CONFIG = {
  controlsPanel: {
    width: 200,
    maxHeight: "90vh",
    position: { top: 16, right: 16 },
    background: "rgba(0,0,0,0.85)",
    color: "white",
    padding: 16,
    borderRadius: 10,
    zIndex: 10,
  },
  materialInfoPanel: {
    position: { left: 16, bottom: 16 },
    maxWidth: 520,
    background: "rgba(0,0,0,0.75)",
    color: "white",
    padding: 12,
    borderRadius: 10,
    zIndex: 10,
  },
  buttons: {
    primary: {
      padding: 14,
      borderRadius: 6,
      fontWeight: 700,
      fontSize: 14,
      transition: "background-color 0.2s",
    },
    secondary: {
      padding: 10,
      borderRadius: 6,
      fontWeight: 700,
      fontSize: 12,
    },
  },
  colors: {
    success: "#4CAF50",
    successHover: "#45a049",
    info: "#2196F3",
    infoHover: "#1976D2",
    warning: "#FF9800",
    error: "#ff6b6b",
    disabled: "#666",
    disabledHover: "#777",
    background: {
      dark: "rgba(0,0,0,0.85)",
      darker: "rgba(0,0,0,0.75)",
      light: "rgba(255,255,255,0.05)",
    },
  },
  background: {
    gradient: "#333333", // Dark grey background
  },
};

// =========================
// LIGHTING CONTROL CONFIG
// =========================
export const LIGHTING_CONTROLS = [
  {
    key: "exposure",
    label: " ",
    min: 0.5,
    max: 2.0,
    step: 0.01,
    desc: "ACES Filmic tone mapping",
  },
  {
    key: "ambient",
    label: "Ambient",
    min: 0,
    max: 0.5,
    step: 0.01,
    desc: "Very low (0.1-0.2 recommended)",
  },
  {
    key: "key",
    label: "Key Light",
    min: 0,
    max: 1.5,
    step: 0.01,
    desc: "Main directional light",
  },
  {
    key: "fill",
    label: "Fill Light",
    min: 0,
    max: 1.0,
    step: 0.01,
    desc: "Softens shadows",
  },
  {
    key: "rim",
    label: "Rim Light",
    min: 0,
    max: 1.0,
    step: 0.01,
    desc: "Edge highlight (keep subtle)",
  },
];

// =========================
// ENVIRONMENT ROTATION CONFIG
// =========================
export const ENV_ROTATION_CONFIG = {
  min: -180,
  max: 180,
  step: 1,
};

// =========================
// TEXTURE QUALITY CONFIG
// =========================
export const TEXTURE_CONFIG = {
  // Texture quality settings for artwork layers
  // CRISP: Uses mipmaps and anisotropy for sharp textures (recommended for artwork)
  // FAST: No mipmaps, linear filtering (may appear blurry but faster)
  QUALITY: "CRISP", // Options: "CRISP" | "FAST"
  // Maximum anisotropy level (higher = sharper at oblique angles, max typically 16)
  MAX_ANISOTROPY: 16,
};

// =========================
// USDZ EXPORT CONFIG
// =========================
export const USDZ_CONFIG = {
  filename: "model.usdz",
  options: {
    maxTextureSize: 2048,
  },
};

// =========================
// MESH TYPE COLORS
// =========================
export const MESH_TYPE_COLORS = {
  fullBleed: "#4CAF50",
  silverFullBleed: "#66BB6A",
  whiteMetalFullBleed: "#E0E0E0",
  woodFullBleed: "#8BC34A",
  mirrorFullBleed: "#9C27B0",
  shrunk: "#2196F3",
  silverShrunk: "#42A5F5",
  whiteMetalShrunk: "#BDBDBD",
  woodShrunk: "#03A9F4",
  mirrorShrunk: "#E91E63",
  frame: "#FF9800",
  back: "#9E9E9E",
  silverMetalBack: "#9E9E9E",
  whiteMetalBack: "#9E9E9E",
  woodBack: "#9E9E9E",
  mirrorBack: "#9E9E9E",
};
