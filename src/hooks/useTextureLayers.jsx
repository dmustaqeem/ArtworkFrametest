import { useState, useRef } from "react";

/**
 * Custom hook to manage texture layers state
 */
export function useTextureLayers() {
  const [textureLayers, setTextureLayers] = useState([]); // Filtered layers
  const allTextureLayersRef = useRef([]); // All layers (unfiltered)
  const originalTexturesRef = useRef(new Map()); // Map<layerId, originalTexture>
  const originalMaterialPropertiesRef = useRef(new Map()); // Map<layerId, originalMaterialProperties>

  /**
   * Set all texture layers (unfiltered)
   */
  const setAllTextureLayers = (layers) => {
    allTextureLayersRef.current = layers;
  };

  /**
   * Set filtered texture layers
   */
  const setFilteredTextureLayers = (layers) => {
    setTextureLayers(layers);
  };

  /**
   * Store original texture for a layer
   */
  const storeOriginalTexture = (layerId, texture) => {
    originalTexturesRef.current.set(layerId, texture);
  };

  /**
   * Get original texture for a layer
   */
  const getOriginalTexture = (layerId) => {
    return originalTexturesRef.current.get(layerId);
  };

  /**
   * Store all original textures from layers
   */
  const storeOriginalTextures = (layers) => {
    const originalTextures = new Map();
    const originalProperties = new Map();
    layers.forEach((layer) => {
      if (layer.material && layer.material.map) {
        originalTextures.set(layer.id, layer.material.map);
      }
      // Store original material properties for mirror materials
      if (layer.material) {
        const mat = layer.material;
        originalProperties.set(layer.id, {
          roughness: mat.roughness,
          metalness: mat.metalness,
          envMapIntensity: mat.envMapIntensity,
          transparent: mat.transparent,
          opacity: mat.opacity,
          alphaTest: mat.alphaTest,
          side: mat.side,
          depthWrite: mat.depthWrite,
          normalMap: mat.normalMap,
          roughnessMap: mat.roughnessMap,
          metalnessMap: mat.metalnessMap,
          clearcoatMap: mat.clearcoatMap,
          clearcoatNormalMap: mat.clearcoatNormalMap,
          clearcoatRoughnessMap: mat.clearcoatRoughnessMap,
          sheenColorMap: mat.sheenColorMap,
          sheenRoughnessMap: mat.sheenRoughnessMap,
        });
      }
    });
    originalTexturesRef.current = originalTextures;
    originalMaterialPropertiesRef.current = originalProperties;
  };

  /**
   * Store original material properties for a layer (for mirror materials)
   */
  const storeOriginalMaterialProperties = (layerId, material) => {
    if (!material) return;
    originalMaterialPropertiesRef.current.set(layerId, {
      roughness: material.roughness,
      metalness: material.metalness,
      envMapIntensity: material.envMapIntensity,
      transparent: material.transparent,
      opacity: material.opacity,
      alphaTest: material.alphaTest,
      side: material.side,
      depthWrite: material.depthWrite,
      normalMap: material.normalMap,
      roughnessMap: material.roughnessMap,
      metalnessMap: material.metalnessMap,
      clearcoatMap: material.clearcoatMap,
      clearcoatNormalMap: material.clearcoatNormalMap,
      clearcoatRoughnessMap: material.clearcoatRoughnessMap,
      sheenColorMap: material.sheenColorMap,
      sheenRoughnessMap: material.sheenRoughnessMap,
    });
  };

  /**
   * Get original material properties for a layer
   */
  const getOriginalMaterialProperties = (layerId) => {
    return originalMaterialPropertiesRef.current.get(layerId);
  };

  /**
   * Restore original material properties for a layer
   */
  const restoreOriginalMaterialProperties = (layerId, material) => {
    const originalProps = originalMaterialPropertiesRef.current.get(layerId);
    if (!originalProps || !material) return false;

    // Restore all material properties
    if (originalProps.roughness !== undefined) material.roughness = originalProps.roughness;
    if (originalProps.metalness !== undefined) material.metalness = originalProps.metalness;
    if (originalProps.envMapIntensity !== undefined) material.envMapIntensity = originalProps.envMapIntensity;
    if (originalProps.transparent !== undefined) material.transparent = originalProps.transparent;
    if (originalProps.opacity !== undefined) material.opacity = originalProps.opacity;
    if (originalProps.alphaTest !== undefined) material.alphaTest = originalProps.alphaTest;
    if (originalProps.side !== undefined) material.side = originalProps.side;
    if (originalProps.depthWrite !== undefined) material.depthWrite = originalProps.depthWrite;
    
    // Restore maps
    if (originalProps.normalMap !== undefined) material.normalMap = originalProps.normalMap;
    if (originalProps.roughnessMap !== undefined) material.roughnessMap = originalProps.roughnessMap;
    if (originalProps.metalnessMap !== undefined) material.metalnessMap = originalProps.metalnessMap;
    if (originalProps.clearcoatMap !== undefined) material.clearcoatMap = originalProps.clearcoatMap;
    if (originalProps.clearcoatNormalMap !== undefined) material.clearcoatNormalMap = originalProps.clearcoatNormalMap;
    if (originalProps.clearcoatRoughnessMap !== undefined) material.clearcoatRoughnessMap = originalProps.clearcoatRoughnessMap;
    if (originalProps.sheenColorMap !== undefined) material.sheenColorMap = originalProps.sheenColorMap;
    if (originalProps.sheenRoughnessMap !== undefined) material.sheenRoughnessMap = originalProps.sheenRoughnessMap;

    material.needsUpdate = true;
    return true;
  };

  return {
    textureLayers,
    setTextureLayers: setFilteredTextureLayers,
    allTextureLayersRef,
    setAllTextureLayers,
    originalTexturesRef,
    storeOriginalTexture,
    getOriginalTexture,
    storeOriginalTextures,
    originalMaterialPropertiesRef,
    storeOriginalMaterialProperties,
    getOriginalMaterialProperties,
    restoreOriginalMaterialProperties,
  };
}
