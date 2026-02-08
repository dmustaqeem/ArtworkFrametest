/**
 * Texture utility functions
 * Handles texture layer finding and updates
 */

import { findMeshByType, getArtworkMeshForMode, MODE_TYPES } from './meshUtils.jsx';

/**
 * Find texture layer by mesh name
 */
export function findTextureLayerByMeshName(textureLayers, meshName) {
  return textureLayers.find(layer => {
    const layerMeshName = layer.meshName || '';
    return layerMeshName === meshName || layerMeshName.startsWith(meshName);
  });
}

/**
 * Find texture layer by mesh type
 */
export function findTextureLayerByMeshType(textureLayers, meshType) {
  return textureLayers.find(layer => {
    const layerMeshType = layer.meshType || '';
    return layerMeshType === meshType;
  });
}

/**
 * Find texture layer for artwork in a given mode
 * For metals, also checks for silverFullBleed, whiteMetalFullBleed, etc.
 * Also supports "frame" mode for frame textures
 */
export function findArtworkTextureLayer(textureLayers, mode) {
  if (mode === MODE_TYPES.FULL_BLEED) {
    // Try standard fullBleed first
    let layer = findTextureLayerByMeshType(textureLayers, MODE_TYPES.FULL_BLEED);
    if (layer) return layer;
    
    // For metals, also check silverFullBleed and whiteMetalFullBleed
    layer = findTextureLayerByMeshType(textureLayers, "silverFullBleed");
    if (layer) return layer;
    
    layer = findTextureLayerByMeshType(textureLayers, "whiteMetalFullBleed");
    if (layer) return layer;
    
    return null;
  }
  if (mode === MODE_TYPES.SHRUNK) {
    // Try standard shrunk first
    let layer = findTextureLayerByMeshType(textureLayers, MODE_TYPES.SHRUNK);
    if (layer) return layer;
    
    // For metals, also check silverShrunk and whiteMetalShrunk
    layer = findTextureLayerByMeshType(textureLayers, "silverShrunk");
    if (layer) return layer;
    
    layer = findTextureLayerByMeshType(textureLayers, "whiteMetalShrunk");
    if (layer) return layer;
    
    return null;
  }
  if (mode === MODE_TYPES.FRAME || mode === "frame") {
    // Find frame layer
    return findTextureLayerByMeshType(textureLayers, MODE_TYPES.FRAME);
  }
  return null;
}

/**
 * Find texture layer by exact mesh name or pattern
 */
export function findTextureLayer(textureLayers, identifier) {
  // Try exact match first
  let layer = textureLayers.find(l => l.meshName === identifier);
  if (layer) return layer;
  
  // Try by mesh type
  if (identifier === MODE_TYPES.FULL_BLEED || identifier === MODE_TYPES.SHRUNK) {
    return findArtworkTextureLayer(textureLayers, identifier);
  }
  
  // Try pattern match (handles suffixes like 001)
  layer = textureLayers.find(l => {
    const meshName = l.meshName || '';
    return meshName.startsWith(identifier) || identifier.startsWith(meshName);
  });
  
  return layer || null;
}

/**
 * Get all texture layers for a given mode
 */
export function getTextureLayersForMode(textureLayers, mode) {
  if (mode === MODE_TYPES.FULL_BLEED) {
    return textureLayers.filter(l => l.meshType === MODE_TYPES.FULL_BLEED);
  }
  if (mode === MODE_TYPES.SHRUNK) {
    return textureLayers.filter(l => 
      l.meshType === MODE_TYPES.SHRUNK || l.meshType === MODE_TYPES.FRAME
    );
  }
  return textureLayers;
}
