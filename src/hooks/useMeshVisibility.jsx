import { useState } from "react";

/**
 * Custom hook to manage mesh visibility state
 */
export function useMeshVisibility() {
  const [meshes, setMeshes] = useState([]);
  const [showMeshControls, setShowMeshControls] = useState(false);

  /**
   * Toggle mesh visibility
   */
  const toggleMeshVisibility = (meshId, meshVisibilityManager) => {
    if (!meshVisibilityManager) return;
    
    const updatedMeshes = meshVisibilityManager.toggleMeshVisibility(meshId);
    setMeshes(updatedMeshes);
    return updatedMeshes;
  };

  /**
   * Filter texture layers based on mesh visibility
   */
  const filterTextureLayersByMeshVisibility = (allLayers, meshVisibilityManager, materialType = null) => {
    if (!meshVisibilityManager) return allLayers;
    return meshVisibilityManager.filterTextureLayersByMeshVisibility(allLayers, materialType);
  };

  return {
    meshes,
    setMeshes,
    showMeshControls,
    setShowMeshControls,
    toggleMeshVisibility,
    filterTextureLayersByMeshVisibility,
  };
}
