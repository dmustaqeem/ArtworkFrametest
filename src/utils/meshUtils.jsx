/**
 * Mesh utility functions
 * Handles mesh name matching and mode detection based on naming standards:
 * - Artwork_FullBleed (or Artwork_FullBleed001)
 * - Artwork_Shrunk (or Artwork_Shrunk001)
 * - Frame_Edge (or Frame_Edge001)
 */

/**
 * Mesh naming patterns
 */
export const MESH_PATTERNS = {
  FULL_BLEED: /^Artwork_FullBleed/i,
  SHRUNK: /^Artwork_Shrunk/i,
  FRAME_EDGE: /^Frame_Edge/i,
};

/**
 * Mode types
 */
export const MODE_TYPES = {
  FULL_BLEED: 'fullBleed',
  SHRUNK: 'shrunk',
  FRAME: 'frame',
};

/**
 * Check if mesh name matches a pattern
 */
export function matchesMeshPattern(meshName, pattern) {
  if (!meshName) return false;
  return pattern.test(meshName);
}

/**
 * Get mesh type from mesh name
 */
export function getMeshType(meshName) {
  if (!meshName) return null;
  
  if (matchesMeshPattern(meshName, MESH_PATTERNS.FULL_BLEED)) {
    return MODE_TYPES.FULL_BLEED;
  }
  if (matchesMeshPattern(meshName, MESH_PATTERNS.SHRUNK)) {
    return MODE_TYPES.SHRUNK;
  }
  if (matchesMeshPattern(meshName, MESH_PATTERNS.FRAME_EDGE)) {
    return MODE_TYPES.FRAME;
  }
  
  return null;
}

/**
 * Find mesh by name pattern (handles suffixes like 001)
 */
export function findMeshByPattern(meshes, pattern) {
  return meshes.find(mesh => {
    const meshName = mesh.name || mesh.meshName || '';
    return matchesMeshPattern(meshName, pattern);
  });
}

/**
 * Find mesh by type (fullBleed, shrunk, frame)
 */
export function findMeshByType(meshes, meshType) {
  const patternMap = {
    [MODE_TYPES.FULL_BLEED]: MESH_PATTERNS.FULL_BLEED,
    [MODE_TYPES.SHRUNK]: MESH_PATTERNS.SHRUNK,
    [MODE_TYPES.FRAME]: MESH_PATTERNS.FRAME_EDGE,
  };
  
  const pattern = patternMap[meshType];
  if (!pattern) return null;
  
  return findMeshByPattern(meshes, pattern);
}

/**
 * Find all meshes by type
 */
export function findMeshesByType(meshes, meshType) {
  const patternMap = {
    [MODE_TYPES.FULL_BLEED]: MESH_PATTERNS.FULL_BLEED,
    [MODE_TYPES.SHRUNK]: MESH_PATTERNS.SHRUNK,
    [MODE_TYPES.FRAME]: MESH_PATTERNS.FRAME_EDGE,
  };
  
  const pattern = patternMap[meshType];
  if (!pattern) return [];
  
  return meshes.filter(mesh => {
    const meshName = mesh.name || mesh.meshName || '';
    return matchesMeshPattern(meshName, pattern);
  });
}

/**
 * Get artwork mesh for a given mode
 */
export function getArtworkMeshForMode(meshes, mode) {
  if (mode === MODE_TYPES.FULL_BLEED) {
    return findMeshByType(meshes, MODE_TYPES.FULL_BLEED);
  }
  if (mode === MODE_TYPES.SHRUNK) {
    return findMeshByType(meshes, MODE_TYPES.SHRUNK);
  }
  return null;
}
