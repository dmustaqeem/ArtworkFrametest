/**
 * Material Modules Registry
 * Central export for all material types
 */

import * as AcrylicMaterial from "./AcrylicMaterial.jsx";
import * as MetalMaterial from "./MetalMaterial.jsx";
import * as WoodMaterial from "./WoodMaterial.jsx";
import * as MirrorMaterial from "./MirrorMaterial.jsx";
import * as MetalBoxMaterial from "./MetalBoxMaterial.jsx";
import * as DefaultMaterial from "./DefaultMaterial.jsx";

/**
 * Register all material default lighting configurations with LightingManager
 * This is called when LightingManager is initialized
 * @param {Object} lightingManager - LightingManager instance
 */
export function registerMaterialLightingDefaults(lightingManager) {
  if (!lightingManager) return;
  
  // Register all material defaults
  lightingManager.registerMaterialDefaults("ACRYLIC", AcrylicMaterial.DEFAULT_LIGHTING);
  lightingManager.registerMaterialDefaults("METAL", MetalMaterial.DEFAULT_LIGHTING);
  lightingManager.registerMaterialDefaults("METAL_BOX", MetalBoxMaterial.DEFAULT_LIGHTING);
  lightingManager.registerMaterialDefaults("WOOD", WoodMaterial.DEFAULT_LIGHTING);
  lightingManager.registerMaterialDefaults("MIRROR", MirrorMaterial.DEFAULT_LIGHTING);
  lightingManager.registerMaterialDefaults("DEFAULT", DefaultMaterial.DEFAULT_LIGHTING);
}

/**
 * Material modules registry
 * Supported material types:
 * - ACRYLIC: Acrylic Print, Skateboard Acrylic Art, Surfboard Acrylic Art
 * - METAL: Metal Print (Brushed Silver), Metal Print (White)
 * - METAL_BOX: Metal Box Print (Brushed Silver), Metal Box Print (White)
 * - WOOD: Eco Friendly Wood Print
 * - MIRROR: Print on Mirror
 */
export const MATERIAL_MODULES = {
  ACRYLIC: {
    name: "Acrylic Print",
    description: "Premium 5mm acrylic glass - Brilliant, vivid colors with depth",
    icon: "✨",
    preset: AcrylicMaterial.ACRYLIC_PRESET,
    classify: AcrylicMaterial.classifyMaterial,
    applyPreset: AcrylicMaterial.applyAcrylicPreset,
    defaultLighting: AcrylicMaterial.DEFAULT_LIGHTING,
    LightingControls: AcrylicMaterial.AcrylicLightingControls,
    updateMaterials: AcrylicMaterial.updateAcrylicMaterials,
    updateReflectionIntensity: AcrylicMaterial.updateAcrylicReflectionIntensity,
    updateExposure: AcrylicMaterial.updateAcrylicExposure,
  },
  METAL: {
    name: "Metal Print",
    description: "HD print on brushed silver/white aluminum - Super-matt finish with no reflections",
    icon: "🔩",
    subcategories: {
      brushed_silver: "Metal Print - Brushed Silver",
      white: "Metal Print - White",
    },
    preset: MetalMaterial.METAL_PRESET,
    classify: MetalMaterial.classifyMaterial,
    applyPreset: MetalMaterial.applyMetalPreset,
    defaultLighting: MetalMaterial.DEFAULT_LIGHTING,
    LightingControls: MetalMaterial.MetalLightingControls,
    updateMaterials: MetalMaterial.updateMetalMaterials,
    updateReflectionIntensity: MetalMaterial.updateMetalReflectionIntensity,
    updateFinish: MetalMaterial.updateMetalFinish,
    updateColor: MetalMaterial.updateMetalColor,
  },
  METAL_BOX: {
    name: "Metal Box Print",
    description: "Real 3D folded metal depth - Bold 30mm return edge - Super-matt textured finish",
    icon: "📦",
    subcategories: {
      brushed_silver: "Metal Box Print - Brushed Silver",
      white: "Metal Box Print - White",
    },
    preset: MetalBoxMaterial.METAL_BOX_PRESET,
    classify: MetalBoxMaterial.classifyMaterial,
    applyPreset: MetalBoxMaterial.applyMetalBoxPreset,
    defaultLighting: MetalBoxMaterial.DEFAULT_LIGHTING,
    LightingControls: MetalBoxMaterial.MetalBoxLightingControls,
    updateMaterials: MetalBoxMaterial.updateMetalBoxMaterials,
    updateReflectionIntensity: MetalBoxMaterial.updateMetalBoxReflectionIntensity,
    updateFinish: MetalBoxMaterial.updateMetalBoxFinish,
    updateColor: MetalBoxMaterial.updateMetalBoxColor,
  },
  WOOD: {
    name: "Eco Friendly Wood Print",
    description: "Wood from FSC certified sustainable forests - Natural wood grain adds warmth",
    icon: "🪵",
    preset: WoodMaterial.WOOD_PRESET,
    classify: WoodMaterial.classifyMaterial,
    applyPreset: WoodMaterial.applyWoodPreset,
    defaultLighting: WoodMaterial.DEFAULT_LIGHTING,
    LightingControls: WoodMaterial.WoodLightingControls,
    updateMaterials: WoodMaterial.updateWoodMaterials,
    updateReflectionIntensity: WoodMaterial.updateWoodReflectionIntensity,
  },
  MIRROR: {
    name: "Print on Mirror",
    description: "Printed on mirror aluminium composite - Eye-catching reflective quality",
    icon: "🪞",
    preset: MirrorMaterial.MIRROR_PRESET,
    classify: MirrorMaterial.classifyMaterial,
    applyPreset: MirrorMaterial.applyMirrorPreset,
    defaultLighting: MirrorMaterial.DEFAULT_LIGHTING,
    LightingControls: MirrorMaterial.MirrorLightingControls,
    updateMaterials: MirrorMaterial.updateMirrorMaterials,
    updateReflectionIntensity: MirrorMaterial.updateMirrorReflectionIntensity,
  },
};

/**
 * Get material module by type
 * @param {string} materialType - One of: ACRYLIC, METAL, METAL_BOX, WOOD, MIRROR
 * @returns {Object} Material module configuration
 */
export const getMaterialModule = (materialType) => {
  if (!MATERIAL_MODULES[materialType]) {
    return MATERIAL_MODULES.ACRYLIC;
  }
  return MATERIAL_MODULES[materialType];
};

/**
 * Get list of all supported material types
 */
export const getSupportedMaterialTypes = () => {
  return Object.keys(MATERIAL_MODULES);
};
