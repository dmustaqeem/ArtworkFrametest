// isArtworkLayer will be obtained from the active material module


/**
 * MaterialProcessor - Orchestrates material classification and application
 */
export class MaterialProcessor {
  constructor(materialModule, renderer) {
    // Store material module (validation will happen when methods are called)
    this.materialModule = materialModule;
    this.renderer = renderer;
    this.baseEnvMapIntensities = new Map();
    
    // Log warnings if material module is invalid (but don't throw)
    if (!materialModule) {
      console.warn("MaterialProcessor: materialModule is null or undefined");
    } else {
      if (!materialModule.classify || typeof materialModule.classify !== 'function') {
        console.warn("MaterialProcessor: materialModule is missing classify function");
      }
      if (!materialModule.preset) {
        console.warn("MaterialProcessor: materialModule is missing preset object");
      }
      if (!materialModule.applyPreset || typeof materialModule.applyPreset !== 'function') {
        console.warn("MaterialProcessor: materialModule is missing applyPreset function");
      }
    }
  }

  /**
   * Determine if a material should be locked to the metal system
   * Only metal background meshes (not artwork) should be locked
   */
  _shouldLockMetalMaterial(materialType, meshType, role) {
    if (!(materialType === "METAL" || materialType === "METAL_BOX")) return false;

    // Artwork must NEVER be locked as metal
    if (role === "PRINT") return false;

    // Background metal meshes (the ones you already treat specially)
    const isMetalBackground =
      meshType === "silverFullBleed" ||
      meshType === "silverShrunk" ||
      meshType === "whiteMetalFullBleed" ||
      meshType === "whiteMetalShrunk";

    // If it's not artwork and is one of your metal BG meshes, it belongs to MetalMaterial system.
    return isMetalBackground;
  }

  /**
   * Determine if a material should be locked to the mirror system
   * All mirror materials (including artwork) should be locked
   */
  _shouldLockMirrorMaterial(materialType) {
    return materialType === "MIRROR";
  }

  /**
   * Apply material-type-specific post-processing
   * Handles special requirements like map removal for metals, render orders, etc.
   */
  _applyMaterialTypePostProcessing(obj, updatedMat, materialType, meshType, role) {
    const isMetal = materialType === "METAL" || materialType === "METAL_BOX";
    
    if (isMetal) {
      // ✅ NEVER remove artwork map (PRINT role) - preserves PNG clarity
      // Only remove maps on metal background meshes (never on artwork PRINT layer)
      const isArtwork = role === "PRINT";
      const isMetalBackground =
        meshType === "silverFullBleed" ||
        meshType === "silverShrunk" ||
        meshType === "whiteMetalFullBleed" ||
        meshType === "whiteMetalShrunk";
      
      // Only remove map if it's a metal background mesh (not artwork)
      if (!isArtwork && isMetalBackground && updatedMat.map) {
        updatedMat.map = null;
        updatedMat.needsUpdate = true;
      }
      
      // ✅ Render order layering
      // Artwork layer (fullBleed/shrunk) should be on top, metal background below
      if (meshType === "fullBleed" || meshType === "shrunk") {
        obj.renderOrder = 2; // artwork on top
      } else if (isMetalBackground) {
        obj.renderOrder = 1; // background below artwork
      } else {
        obj.renderOrder = 0; // Default for frame, back, etc.
      }
    }
    // Other material types use preset.renderOrder (handled in main pipeline)
  }

  /**
   * Process all materials in a model
   * Unified pipeline for all material types
   */
  processModelMaterials(model, options = {}) {
    if (!this.materialModule) {
      console.error("MaterialProcessor: materialModule is null");
      return { materialDetails: [], textureLayers: [] };
    }

    const {
      materialType,
      metalFinish,
      metalColor,
      reflectionIntensity = 1.0,
      meshVisibilityManager, // Optional: for mesh type classification
    } = options;

    const materialDetails = [];
    const textureLayers = [];
    let layerIdCounter = 0;

    model.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const meshName = obj.name || "";

      // Get mesh type if meshVisibilityManager is provided
      const meshType = meshVisibilityManager
        ? meshVisibilityManager.classifyMeshType(meshName)
        : "other";

      mats.forEach((mat, matIndex) => {
        // HARD STOP: never touch locked system materials (METAL or MIRROR)
        // Must check BEFORE any processing to prevent modifications
        if (mat.userData?.__lockSystem === "METAL" || mat.userData?.__lockSystem === "MIRROR") {
          return; // NEVER touch locked systems
        }
        
        // Unified classification for all material types
        const role = this.materialModule.classify({
          meshName,
          material: mat,
          materialType,
          metalColor: (materialType === "METAL" || materialType === "METAL_BOX") ? metalColor : null
        });

        // ✅ LOCK MIRROR SYSTEM MATERIALS *BEFORE* applyPreset touches them
        // MirrorMaterial.applyMirrorState is the single source of truth
        if (this._shouldLockMirrorMaterial(materialType)) {
          mat.userData = mat.userData || {};
          mat.userData.__lockSystem = "MIRROR";

          // Still collect layers + details, but DO NOT apply preset pipeline here
          // (MirrorMaterial.applyMirrorState is the single source of truth)
          
          // Collect texture layer info (keep map)
          const hasMap = !!mat.map;
          if (hasMap) {
            const layerId = `layer_${layerIdCounter++}`;
            textureLayers.push({
              id: layerId,
              meshName,
              materialIndex: matIndex,
              mapType: "map",
              hasOriginal: true,
              material: mat,
              mesh: obj,
              materialCategory: role,
              meshType,
            });
          }

          // Store material details
          materialDetails.push({
            meshName,
            materialIndex: matIndex,
            materialName: mat.name || `Material_${matIndex}`,
            materialType: mat?.type || "UnknownMaterial",
            materialClass: mat.constructor.name,
            materialCategory: role,
          });

          return; // HARD STOP: no preset, no env intensity, no post-processing
        }

        // ✅ LOCK METAL SYSTEM MATERIALS *BEFORE* applyPreset touches them
        if (this._shouldLockMetalMaterial(materialType, meshType, role)) {
          mat.userData = mat.userData || {};
          mat.userData.__lockSystem = "METAL";

          // Also ensure render order + map removal logic still applies
          this._applyMaterialTypePostProcessing(obj, mat, materialType, meshType, role);

          // Still collect texture layer info if needed
          const hasMap = !!mat.map;
          const isMetalFullBleedOrShrunk = true; // these BG meshes are part of metal stack anyway

          if (hasMap || isMetalFullBleedOrShrunk) {
            const layerId = `layer_${layerIdCounter++}`;
            textureLayers.push({
              id: layerId,
              meshName,
              materialIndex: matIndex,
              mapType: "map",
              hasOriginal: hasMap,
              material: mat,
              mesh: obj,
              materialCategory: role,
              meshType: meshType,
            });
          }

          // Store material details
          materialDetails.push({
            meshName,
            materialIndex: matIndex,
            materialName: mat.name || `Material_${matIndex}`,
            materialType: mat?.type || "UnknownMaterial",
            materialClass: mat.constructor.name,
            materialCategory: role,
          });

          // HARD STOP: do NOT run preset pipeline on metal system materials
          return;
        }

        // Get preset for this role
        const preset = this.materialModule.preset[role] || this.materialModule.preset.DEFAULT;

        // Build preset options
        const presetOptions = (materialType === "METAL" || materialType === "METAL_BOX")
          ? { metalFinish, metalColor, materialType }
          : { materialType };

        // Apply preset (handles material upgrades and property application)
        let updatedMat = this.materialModule.applyPreset(
          mat,
          preset,
          this.renderer,
          role,
          presetOptions
        );

        // Replace material if upgraded
        if (updatedMat !== mat) {
          if (Array.isArray(obj.material)) {
            obj.material[matIndex] = updatedMat;
          } else {
            obj.material = updatedMat;
          }
        }

        // Store base environment intensity
        if (preset.envBase !== undefined) {
          this.baseEnvMapIntensities.set(updatedMat, preset.envBase);
          // NEVER set envMapIntensity for locked systems - use lock-based detection (bulletproof)
          const isLockedMetal = updatedMat.userData?.__lockSystem === "METAL";
          const isLockedMirror = updatedMat.userData?.__lockSystem === "MIRROR";
          if (!isLockedMetal && !isLockedMirror) {
            updatedMat.envMapIntensity = preset.envBase * reflectionIntensity;
          }
          // For metals, envMapIntensity will be set by MetalMaterial.applyMetalState() only
          // For mirrors, envMapIntensity will be set by MirrorMaterial.applyMirrorState() only
        }

        // Apply material-type-specific post-processing
        this._applyMaterialTypePostProcessing(obj, updatedMat, materialType, meshType, role);

        // Apply render order from preset (if not overridden by post-processing)
        if (preset.renderOrder !== undefined && preset.renderOrder !== 0 && obj.renderOrder === 0) {
          obj.renderOrder = preset.renderOrder;
        }

        // Store material details
        materialDetails.push({
          meshName,
          materialIndex: matIndex,
          materialName: mat.name || `Material_${matIndex}`,
          materialType: mat?.type || "UnknownMaterial",
          materialClass: mat.constructor.name,
          materialCategory: role,
        });

        // Detect texture layers (only 'map' for artwork)
        // Check if material has a map or if it's a metal fullBleed/shrunk (which may have map removed)
        const hasMap = !!updatedMat.map;
        const isMetalFullBleedOrShrunk = (materialType === "METAL" || materialType === "METAL_BOX") &&
          (meshType === "fullBleed" || meshType === "shrunk" ||
           meshType === "silverFullBleed" || meshType === "silverShrunk" ||
           meshType === "whiteMetalFullBleed" || meshType === "whiteMetalShrunk");

        if (hasMap || isMetalFullBleedOrShrunk) {
          const layerId = `layer_${layerIdCounter++}`;
          textureLayers.push({
            id: layerId,
            meshName,
            materialIndex: matIndex,
            mapType: "map",
            hasOriginal: hasMap,
            material: updatedMat,
            mesh: obj,
            materialCategory: role,
            meshType: meshType,
          });
        }
      });
    });

    return {
      materialDetails,
      textureLayers,
    };
  }

  /**
   * Update materials when material type changes
   * Unified pipeline for all material types
   */
  updateMaterialsForType(model, options = {}) {
    if (!this.materialModule) {
      console.error("MaterialProcessor: materialModule is null");
      return;
    }

    const {
      materialType,
      metalFinish,
      metalColor,
      reflectionIntensity = 1.0,
      meshVisibilityManager, // Optional: for mesh type classification
    } = options;

    model.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const meshName = obj.name || "";

      // Get mesh type if meshVisibilityManager is provided
      const meshType = meshVisibilityManager
        ? meshVisibilityManager.classifyMeshType(meshName)
        : "other";

      mats.forEach((mat, matIndex) => {
        // HARD STOP: never touch locked system materials (METAL or MIRROR)
        // Must check BEFORE any processing to prevent modifications
        if (mat.userData?.__lockSystem === "METAL" || mat.userData?.__lockSystem === "MIRROR") {
          return; // Skip locked materials completely
        }
        
        // CRITICAL: For metal and metal box materials, skip artwork layers that have already been modified
        // Artwork layers maintain their own brightness and properties and should NEVER be re-processed
        // This prevents them from being overwritten when UI controls trigger re-renders or material type changes
        // NOTE: MIRROR is NOT included here - MirrorMaterial.applyMirrorState should always re-assert truth
        // Use module-driven isArtworkLayer check (not hardcoded from MirrorMaterial)
        const isArtwork = this.materialModule?.isArtworkLayer
          ? this.materialModule.isArtworkLayer(obj, mat)
          : false;
        
        // Only skip artwork re-processing for METAL systems (if you still need this behavior)
        if ((materialType === "METAL" || materialType === "METAL_BOX") && isArtwork) {
          return; // Skip this material, preserve its properties
        }
        
        // Unified classification for all material types
        const role = this.materialModule.classify({
          meshName,
          material: mat,
          materialType,
          metalColor: (materialType === "METAL" || materialType === "METAL_BOX") ? metalColor : null
        });

        // ✅ LOCK MIRROR SYSTEM MATERIALS *BEFORE* applyPreset touches them
        // MirrorMaterial.applyMirrorState is the single source of truth
        if (this._shouldLockMirrorMaterial(materialType)) {
          mat.userData = mat.userData || {};
          mat.userData.__lockSystem = "MIRROR";
          // DO NOT apply preset pipeline - MirrorMaterial.applyMirrorState handles everything
          return;
        }

        // ✅ LOCK + BYPASS preset pipeline for metal system materials
        if (this._shouldLockMetalMaterial(materialType, meshType, role)) {
          mat.userData = mat.userData || {};
          mat.userData.__lockSystem = "METAL";
          this._applyMaterialTypePostProcessing(obj, mat, materialType, meshType, role);
          return;
        }

        // Get preset for this role
        const preset = this.materialModule.preset[role] || this.materialModule.preset.DEFAULT;

        // Build preset options
        const presetOptions = (materialType === "METAL" || materialType === "METAL_BOX")
          ? { metalFinish, metalColor, materialType }
          : { materialType };

        // Apply preset (handles material upgrades and property application)
        const updatedMat = this.materialModule.applyPreset(
          mat,
          preset,
          this.renderer,
          role,
          presetOptions
        );

        // Replace material if upgraded
        if (updatedMat !== mat) {
          if (Array.isArray(obj.material)) {
            obj.material[matIndex] = updatedMat;
          } else {
            obj.material = updatedMat;
          }
        }

        // Update environment intensity
        if (preset.envBase !== undefined) {
          this.baseEnvMapIntensities.set(updatedMat, preset.envBase);
          // NEVER set envMapIntensity for locked systems - use lock-based detection (bulletproof)
          const isLockedMetal = updatedMat.userData?.__lockSystem === "METAL";
          const isLockedMirror = updatedMat.userData?.__lockSystem === "MIRROR";
          if (!isLockedMetal && !isLockedMirror) {
            updatedMat.envMapIntensity = preset.envBase * reflectionIntensity;
          }
          // For metals, envMapIntensity will be set by MetalMaterial.applyMetalState() only
          // For mirrors, envMapIntensity will be set by MirrorMaterial.applyMirrorState() only
        }

        // Apply material-type-specific post-processing
        this._applyMaterialTypePostProcessing(obj, updatedMat, materialType, meshType, role);

        // Apply render order from preset (if not overridden by post-processing)
        if (preset.renderOrder !== undefined && preset.renderOrder !== 0 && obj.renderOrder === 0) {
          obj.renderOrder = preset.renderOrder;
        }
      });
    });
  }

  /**
   * Update reflection intensity for all materials
   */
  updateReflectionIntensity(reflectionIntensity) {
    if (this.materialModule.updateReflectionIntensity) {
      // This will be handled by the material module
      return;
    }

    // Fallback: update stored intensities
    // CRITICAL: For locked systems, DO NOT set envMapIntensity here - use lock-based detection (bulletproof)
    this.baseEnvMapIntensities.forEach((baseIntensity, mat) => {
      // Check lock system tag (bulletproof detection)
      const isLockedMetal = mat.userData?.__lockSystem === "METAL";
      const isLockedMirror = mat.userData?.__lockSystem === "MIRROR";
      if (mat.envMapIntensity !== undefined && !isLockedMetal && !isLockedMirror) {
        // Only update envMapIntensity for non-locked materials
        mat.envMapIntensity = baseIntensity * reflectionIntensity;
      }
      // For metals, envMapIntensity will be set by MetalMaterial.applyMetalState()
      // For mirrors, envMapIntensity will be set by MirrorMaterial.applyMirrorState()
    });
  }

  /**
   * Get base environment map intensities map
   */
  getBaseEnvMapIntensities() {
    return this.baseEnvMapIntensities;
  }

  /**
   * Set material module
   */
  setMaterialModule(materialModule) {
    if (!materialModule) {
      console.error("MaterialProcessor.setMaterialModule: materialModule is null");
      return;
    }
    if (!materialModule.classify || typeof materialModule.classify !== 'function') {
      console.error("MaterialProcessor.setMaterialModule: materialModule must have a classify function");
      return;
    }
    if (!materialModule.preset) {
      console.error("MaterialProcessor.setMaterialModule: materialModule must have a preset object");
      return;
    }
    if (!materialModule.applyPreset || typeof materialModule.applyPreset !== 'function') {
      console.error("MaterialProcessor.setMaterialModule: materialModule must have an applyPreset function");
      return;
    }
    this.materialModule = materialModule;
  }

  /**
   * Get material module
   */
  getMaterialModule() {
    return this.materialModule;
  }

  /**
   * Analyze normalMap to understand its structure and patterns
   * Studies pixel data, directionality, and determines if it's a brushed pattern
   */
  analyzeNormalMap(texture) {
    if (!texture || !texture.image) {
      return { error: "No texture or image" };
    }

    const image = texture.image;
    let canvas = null;
    let ctx = null;

    try {
      // Get image data
      if (image instanceof HTMLCanvasElement) {
        canvas = image;
        ctx = canvas.getContext('2d');
      } else if (image instanceof HTMLImageElement) {
        canvas = document.createElement('canvas');
        canvas.width = image.width || image.naturalWidth || 512;
        canvas.height = image.height || image.naturalHeight || 512;
        ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
      } else {
        return { error: "Unsupported image type", imageType: image.constructor.name };
      }

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      const analysis = {
        dimensions: { width: canvas.width, height: canvas.height },
        pixelCount: canvas.width * canvas.height,
        rgbStats: {
          r: { min: 255, max: 0, avg: 0 },
          g: { min: 255, max: 0, avg: 0 },
          b: { min: 255, max: 0, avg: 0 },
        },
        directionality: {
          horizontal: 0,
          vertical: 0,
        },
        patterns: {
          isUniform: false,
          hasDirectionalPattern: false,
          isBrushed: false,
          dominantDirection: null,
        },
        samples: {},
      };

      let rSum = 0, gSum = 0, bSum = 0;
      const samplePoints = [
        { x: Math.floor(canvas.width / 2), y: Math.floor(canvas.height / 2), name: "center" },
        { x: 10, y: 10, name: "topLeft" },
        { x: canvas.width - 10, y: 10, name: "topRight" },
        { x: 10, y: canvas.height - 10, name: "bottomLeft" },
        { x: canvas.width - 10, y: canvas.height - 10, name: "bottomRight" },
      ];

      // Analyze all pixels
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const pixelIndex = i / 4;
        const x = pixelIndex % canvas.width;
        const y = Math.floor(pixelIndex / canvas.width);

        // Update min/max
        analysis.rgbStats.r.min = Math.min(analysis.rgbStats.r.min, r);
        analysis.rgbStats.r.max = Math.max(analysis.rgbStats.r.max, r);
        analysis.rgbStats.g.min = Math.min(analysis.rgbStats.g.min, g);
        analysis.rgbStats.g.max = Math.max(analysis.rgbStats.g.max, g);
        analysis.rgbStats.b.min = Math.min(analysis.rgbStats.b.min, b);
        analysis.rgbStats.b.max = Math.max(analysis.rgbStats.b.max, b);

        rSum += r;
        gSum += g;
        bSum += b;

        // Store sample points
        const samplePoint = samplePoints.find(sp => 
          Math.abs(x - sp.x) < 5 && Math.abs(y - sp.y) < 5
        );
        if (samplePoint && !analysis.samples[samplePoint.name]) {
          analysis.samples[samplePoint.name] = { r, g, b, x, y };
        }
      }

      // Calculate averages
      analysis.rgbStats.r.avg = Math.round(rSum / analysis.pixelCount);
      analysis.rgbStats.g.avg = Math.round(gSum / analysis.pixelCount);
      analysis.rgbStats.b.avg = Math.round(bSum / analysis.pixelCount);

      // Analyze directionality
      let horizontalVariation = 0;
      let verticalVariation = 0;
      const step = Math.max(1, Math.floor(canvas.width / 50));
      let sampleCount = 0;

      for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width - step; x += step) {
          const idx1 = (y * canvas.width + x) * 4;
          const idx2 = (y * canvas.width + x + step) * 4;
          horizontalVariation += Math.abs(data[idx1] - data[idx2]);
          horizontalVariation += Math.abs(data[idx1 + 1] - data[idx2 + 1]);
          sampleCount++;
        }
      }

      for (let y = 0; y < canvas.height - step; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
          const idx1 = (y * canvas.width + x) * 4;
          const idx2 = ((y + step) * canvas.width + x) * 4;
          verticalVariation += Math.abs(data[idx1] - data[idx2]);
          verticalVariation += Math.abs(data[idx1 + 1] - data[idx2 + 1]);
        }
      }

      analysis.directionality.horizontal = Math.round(horizontalVariation / sampleCount);
      analysis.directionality.vertical = Math.round(verticalVariation / sampleCount);

      // Pattern detection
      const rRange = analysis.rgbStats.r.max - analysis.rgbStats.r.min;
      const gRange = analysis.rgbStats.g.max - analysis.rgbStats.g.min;
      const bRange = analysis.rgbStats.b.max - analysis.rgbStats.b.min;

      analysis.patterns.isUniform = rRange < 10 && gRange < 10 && bRange < 10;
      analysis.patterns.hasDirectionalPattern = Math.abs(analysis.directionality.horizontal - analysis.directionality.vertical) > 20;
      analysis.patterns.isBrushed = analysis.patterns.hasDirectionalPattern && (rRange > 30 || gRange > 30);
      
      if (analysis.patterns.hasDirectionalPattern) {
        analysis.patterns.dominantDirection = analysis.directionality.horizontal > analysis.directionality.vertical 
          ? "horizontal" 
          : "vertical";
      }

      // Normal map interpretation
      const typicalNormal = { r: 128, g: 128, b: 255 };
      const deviation = {
        r: Math.abs(analysis.rgbStats.r.avg - typicalNormal.r),
        g: Math.abs(analysis.rgbStats.g.avg - typicalNormal.g),
        b: Math.abs(analysis.rgbStats.b.avg - typicalNormal.b),
      };

      analysis.interpretation = {
        isTypicalNormalMap: deviation.r < 50 && deviation.g < 50 && deviation.b < 50,
        surfaceType: analysis.rgbStats.b.avg > 200 ? "mostly flat" : "varied depth",
        hasStrongDirection: analysis.patterns.hasDirectionalPattern,
        direction: analysis.patterns.dominantDirection,
        likelyBrushed: analysis.patterns.isBrushed && analysis.patterns.dominantDirection === "horizontal",
        rgbRanges: { r: rRange, g: gRange, b: bRange },
      };

      return analysis;
    } catch (error) {
      return { error: `Analysis failed: ${error.message}` };
    }
  }

  dispose() {
    this.baseEnvMapIntensities.clear();
    this.materialModule = null;
    this.renderer = null;
  }
}

/**
 * Factory function to create MaterialProcessor
 */
export function createMaterialProcessor(materialModule, renderer) {
  return new MaterialProcessor(materialModule, renderer);
}
