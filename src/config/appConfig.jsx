/**
 * Application Configuration
 * Centralized configuration for the Artwork Frame application
 */

// =========================
// APP MODE CONFIGURATION
// =========================
export const APP_MODE = {
  API_TEST: 'api_test',      // New API test mode with control panel
  DEMO: 'demo',              // Previous demo mode (GlbTextureSwapTester)
};

// Switch between modes here
export const CURRENT_APP_MODE = APP_MODE.DEMO; // Change to APP_MODE.DEMO for previous mode

// =========================
// MODEL & ASSET PATHS
// =========================
// Helper to get base URL for assets (works in both dev and production)
// For Vite: uses import.meta.env.BASE_URL
// For other build tools: defaults to "/"
const getBaseUrl = () => {
  // Check if we're in a Vite environment
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.BASE_URL || '/';
  }
  // Fallback for other build tools or direct usage
  return '/';
};

const BASE_URL = getBaseUrl();

export const MODEL_PATHS = {
  GLB: `${BASE_URL}assets/models/Acrylic/Acrylic_450x675.glb`,
  HDRI: `${BASE_URL}assets/hdr/studio3.hdr`,
  TEST_IMAGES: {
    IMAGE_1: `${BASE_URL}assets/frames/image4.png`,
    IMAGE_2: `${BASE_URL}assets/frames/Image5.png`,
    FRAME_TEXTURE: `${BASE_URL}assets/frames/1.1.png`, // Texture for testing frames
  },
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
};

// =========================
// DEFAULT STATE VALUES
// =========================
export const DEFAULT_STATE = {
  envRotation: 0,
  reflectionIntensity: 1.0,
  metalFinish: "brushed", // Default to brushed for brushed silver metal
  showReflections: true,
  showLightingControls: false,
  showMeshControls: false,
  showTextureLayers: false,
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
    gradient: `
      radial-gradient(1200px 700px at 50% 40%,
        #f3f3f3 0%,
        #e3e0de 55%,
        #d2cdca 100%),
      linear-gradient(#cfc9c6 0%, #f6f6f6 65%, #ffffff 100%)
    `,
  },
};

// =========================
// LIGHTING CONTROL CONFIG
// =========================
export const LIGHTING_CONTROLS = [
  {
    key: "exposure",
    label: "Exposure",
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
