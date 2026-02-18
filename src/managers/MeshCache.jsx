/**
 * MeshCache - Optimized cache for mesh and material lookups
 * Eliminates repeated model/scene traversals by indexing meshes once at load time
 */
export class MeshCache {
  constructor() {
    // Index meshes by name patterns for fast lookup
    this.meshIndex = new Map(); // Map<patternKey, mesh>
    this.materialIndex = new Map(); // Map<patternKey, material>
    this.meshByName = new Map(); // Map<meshName, mesh> for exact name lookups
    this.allMeshes = []; // Array of all meshes for full traversal when needed
    this.allMaterials = []; // Array of all materials
  }

  /**
   * Build cache from model - call this once when model loads
   * @param {THREE.Object3D} model - The model to index
   */
  buildCache(model) {
    if (!model) {
      this.clear();
      return;
    }

    // Clear existing cache
    this.clear();

    // Traverse once and build all indices
    model.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;

      const meshName = obj.name || "";
      const meshNameLower = meshName.toLowerCase();
      
      // Store by exact name
      this.meshByName.set(meshName, obj);
      this.meshByName.set(meshNameLower, obj);
      
      // Store in all meshes array
      this.allMeshes.push(obj);

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      
      mats.forEach((mat, matIndex) => {
        // Store in all materials array
        this.allMaterials.push({ mesh: obj, material: mat, materialIndex: matIndex });

        // Index by material properties
        if (mat.metalness !== undefined && mat.metalness > 0.4) {
          // Metal material - index by patterns
          this._indexMetalMesh(obj, mat, meshNameLower);
        }

        // Index wood meshes
        if (meshNameLower.includes("wood")) {
          this._indexWoodMesh(obj, mat, meshNameLower);
        }
      });
    });
  }

  /**
   * Index metal mesh by various patterns
   */
  _indexMetalMesh(mesh, material, meshNameLower) {
    // For metal box models, check for box-specific patterns
    const isMetalBox = meshNameLower.includes("box");
    
    // Silver detection: check for "silver" OR metal box without "white"
    const isSilver = meshNameLower.includes("silver") || 
                     (isMetalBox && !meshNameLower.includes("white") && !meshNameLower.includes("whitemetal"));
    
    // White detection: check for "white" AND ("metal" OR "box")
    const isWhite = (meshNameLower.includes("white") && (meshNameLower.includes("metal") || isMetalBox)) ||
                    meshNameLower.includes("whitemetal");
    
    const isFullBleed = meshNameLower.includes("fullbleed") || meshNameLower.includes("full_bleed");
    const isShrunk = meshNameLower.includes("shrunk") || meshNameLower.includes("shrink");
    const isArtwork = meshNameLower.includes("artwork");

    // Skip artwork meshes
    if (isArtwork) return;

    if (isSilver) {
      if (isFullBleed) {
        this._setIndex("silver_fullbleed", mesh, material);
        this._setIndex("silver_fullbleed_color", mesh, material); // For color consistency
      }
      if (isShrunk) {
        this._setIndex("silver_shrunk", mesh, material);
      }
      // For metal box without fullbleed/shrunk, still index as silver if it's a metal box mesh
      if (isMetalBox && !isFullBleed && !isShrunk) {
        this._setIndex("silver_fullbleed", mesh, material);
        this._setIndex("silver_fullbleed_color", mesh, material);
      }
    }

    if (isWhite) {
      if (isFullBleed) {
        this._setIndex("white_fullbleed", mesh, material);
        this._setIndex("white_fullbleed_color", mesh, material); // For color consistency
      }
      if (isShrunk) {
        this._setIndex("white_shrunk", mesh, material);
      }
      // For metal box without fullbleed/shrunk, still index as white if it's a white metal box mesh
      if (isMetalBox && !isFullBleed && !isShrunk) {
        this._setIndex("white_fullbleed", mesh, material);
        this._setIndex("white_fullbleed_color", mesh, material);
      }
    }
  }

  /**
   * Index wood mesh by patterns
   */
  _indexWoodMesh(mesh, material, meshNameLower) {
    const isFullBleed = meshNameLower.includes("fullbleed") || meshNameLower.includes("full_bleed");
    const isShrunk = meshNameLower.includes("shrunk") || meshNameLower.includes("shrink");
    const isArtwork = meshNameLower.includes("artwork");

    // Skip artwork meshes
    if (isArtwork) return;

    if (isFullBleed) {
      this._setIndex("wood_fullbleed", mesh, material);
      this._setIndex("wood_fullbleed_color", mesh, material); // For color consistency
    }
    if (isShrunk) {
      this._setIndex("wood_shrunk", mesh, material);
    }
  }

  /**
   * Set index entry (handles multiple materials per mesh)
   */
  _setIndex(key, mesh, material) {
    // For mesh index, store the mesh (first one wins, but we prefer fullbleed for color)
    if (!this.meshIndex.has(key)) {
      this.meshIndex.set(key, mesh);
    }

    // For material index, prefer the one with higher metalness (for metals) or first one
    const existing = this.materialIndex.get(key);
    if (!existing || (material.metalness !== undefined && material.metalness > (existing.metalness || 0))) {
      this.materialIndex.set(key, material);
    }
  }

  /**
   * Get metal material for color (always from FullBleed for consistency)
   * @param {string} metalType - "silver" or "white"
   * @returns {THREE.Material|null}
   */
  getMetalMaterialForColor(metalType) {
    const key = metalType === "white" ? "white_fullbleed_color" : "silver_fullbleed_color";
    return this.materialIndex.get(key) || this.materialIndex.get(key.replace("_color", "")) || null;
  }

  /**
   * Get metal material for PBR maps (from corresponding mesh - fullBleed or shrunk)
   * @param {string} metalType - "silver" or "white"
   * @param {boolean} isFullBleed - true for fullBleed, false for shrunk
   * @returns {THREE.Material|null}
   */
  getMetalMaterialForMaps(metalType, isFullBleed) {
    const key = metalType === "white" 
      ? (isFullBleed ? "white_fullbleed" : "white_shrunk")
      : (isFullBleed ? "silver_fullbleed" : "silver_shrunk");
    return this.materialIndex.get(key) || null;
  }

  /**
   * Get wood material for color (always from FullBleed for consistency)
   * @returns {THREE.Material|null}
   */
  getWoodMaterialForColor() {
    return this.materialIndex.get("wood_fullbleed_color") || this.materialIndex.get("wood_fullbleed") || null;
  }

  /**
   * Get wood material for PBR maps (from corresponding mesh - fullBleed or shrunk)
   * @param {boolean} isFullBleed - true for fullBleed, false for shrunk
   * @returns {THREE.Material|null}
   */
  getWoodMaterialForMaps(isFullBleed) {
    const key = isFullBleed ? "wood_fullbleed" : "wood_shrunk";
    return this.materialIndex.get(key) || null;
  }

  /**
   * Detect metal type from cached meshes
   * @returns {string|null} - "silver", "white", or null
   */
  detectMetalType() {
    if (this.materialIndex.has("silver_fullbleed") || this.materialIndex.has("silver_shrunk")) {
      return "silver";
    }
    if (this.materialIndex.has("white_fullbleed") || this.materialIndex.has("white_shrunk")) {
      return "white";
    }
    return null;
  }

  /**
   * Get mesh by exact name
   * @param {string} name - Mesh name (case-insensitive)
   * @returns {THREE.Mesh|null}
   */
  getMeshByName(name) {
    return this.meshByName.get(name) || this.meshByName.get(name.toLowerCase()) || null;
  }

  /**
   * Get all meshes (for operations that need to iterate all)
   * @returns {Array<THREE.Mesh>}
   */
  getAllMeshes() {
    return this.allMeshes;
  }

  /**
   * Get all materials (for operations that need to iterate all)
   * @returns {Array<{mesh: THREE.Mesh, material: THREE.Material, materialIndex: number}>}
   */
  getAllMaterials() {
    return this.allMaterials;
  }

  /**
   * Clear cache
   */
  clear() {
    this.meshIndex.clear();
    this.materialIndex.clear();
    this.meshByName.clear();
    this.allMeshes = [];
    this.allMaterials = [];
  }

  /**
   * Check if cache is empty
   */
  isEmpty() {
    return this.allMeshes.length === 0;
  }
}

/**
 * Factory function to create MeshCache
 */
export function createMeshCache() {
  return new MeshCache();
}
