import { useEffect, useRef } from "react";
import { getHDRIPath } from "../config/appConfig.jsx";

/**
 * Custom hook to consolidate all material update effects
 * Handles reflection intensity, metal finish, metal color, material type changes, and environment map toggles
 */
export function useMaterialUpdates({
  modelManagerRef,
  sceneManagerRef,
  environmentManagerRef,
  materialProcessorRef,
  materialType,
  lighting,
  isLoadingRef = null, // Optional ref to track loading state
}) {
  // Track previous material type to detect MIRROR changes
  const previousMaterialTypeRef = useRef(materialType.activeMaterialType);
  // Update reflection intensity - handled by material module (including acrylics)
  useEffect(() => {
    const model = modelManagerRef.current?.getModel();
    if (!model || !materialType.materialModuleRef.current) return;

    const materialModule = materialType.materialModuleRef.current;
    const activeType = materialType.activeMaterialTypeRef.current;
    const envMap = environmentManagerRef.current?.getEnvironmentMap();
    
    // For acrylics: apply matte to artwork, glossy to glass when reflection intensity changes
    if (activeType === "ACRYLIC" && materialModule.applyArtworkMatteGlassGlossy && envMap) {
      materialModule.applyArtworkMatteGlassGlossy(
        model,
        envMap,
        lighting.reflectionIntensity
      );
    } else if (materialModule.updateReflectionIntensity) {
      // Update reflection intensity for other material types
      materialModule.updateReflectionIntensity(
        model,
        lighting.reflectionIntensity,
        materialProcessorRef.current?.getBaseEnvMapIntensities() || new Map()
      );
    }
    
    // Force render update
    const renderer = sceneManagerRef.current?.getRenderer();
    const scene = sceneManagerRef.current?.getScene();
    const camera = sceneManagerRef.current?.getCamera();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }, [lighting.reflectionIntensity, materialType.materialModuleRef, modelManagerRef, materialProcessorRef, sceneManagerRef, environmentManagerRef]);

  // Update metal finish - handled by material module (only for METAL and METAL_BOX)
  useEffect(() => {
    const model = modelManagerRef.current?.getModel();
    if (!model || !materialType.materialModuleRef.current) return;

    const activeType = materialType.activeMaterialTypeRef.current;
    if (activeType !== "METAL" && activeType !== "METAL_BOX") {
      return;
    }

    const materialModule = materialType.materialModuleRef.current;
    if (materialModule.updateFinish) {
      // Pass metalColor to updateFinish so it can update artwork layer PBR for silver
      materialModule.updateFinish(model, lighting.metalFinish, materialType.metalColor);
    }
  }, [lighting.metalFinish, materialType, modelManagerRef]);

  // Update metal color - handled by material module (only for METAL and METAL_BOX)
  useEffect(() => {
    const model = modelManagerRef.current?.getModel();
    if (!model || !materialType.materialModuleRef.current) return;

    const activeType = materialType.activeMaterialTypeRef.current;
    if (activeType !== "METAL" && activeType !== "METAL_BOX") {
      return;
    }

    const materialModule = materialType.materialModuleRef.current;
    if (materialModule.updateColor) {
      materialModule.updateColor(model, materialType.metalColor);
    }
  }, [materialType.metalColor, materialType, modelManagerRef]);

  // Reload HDRI when switching to/from MIRROR material type
  useEffect(() => {
    const activeMaterialType = materialType.activeMaterialType;
    const previousType = previousMaterialTypeRef.current;
    
    // Check if switching to/from MIRROR
    const isSwitchingToMirror = activeMaterialType === "MIRROR" && previousType !== "MIRROR";
    const isSwitchingFromMirror = activeMaterialType !== "MIRROR" && previousType === "MIRROR";
    
    if ((isSwitchingToMirror || isSwitchingFromMirror) && environmentManagerRef.current) {
      const hdriPath = getHDRIPath(activeMaterialType);
      const model = modelManagerRef.current?.getModel();
      
      environmentManagerRef.current.loadHDRI(
        hdriPath,
        (newEnvMap) => {
          // Update materials with new environment map
          if (model && materialType.materialModuleRef.current?.updateMaterials) {
            materialType.materialModuleRef.current.updateMaterials(
              model,
              newEnvMap,
              lighting.showReflections,
              lighting.reflectionIntensity,
              materialProcessorRef.current?.getBaseEnvMapIntensities() || new Map()
            );
          }
        },
        (error) => {
          console.error("Failed to load HDRI for material type:", error);
        }
      );
    }
    
    // Update previous material type
    previousMaterialTypeRef.current = activeMaterialType;
  }, [materialType.activeMaterialType, environmentManagerRef, materialType, lighting, modelManagerRef, materialProcessorRef]);

  // Re-apply materials when material type changes (skip for acrylics)
  useEffect(() => {
    // Skip if model is currently loading
    if (isLoadingRef?.current) {
      return;
    }
    
    const model = modelManagerRef.current?.getModel();
    const renderer = sceneManagerRef.current?.getRenderer();
    if (!model || !renderer || !materialProcessorRef.current) return;

    const activeMaterialType = materialType.activeMaterialType;
    materialType.activeMaterialTypeRef.current = activeMaterialType;
    materialType.setDetectedMaterialType(activeMaterialType);

    // Skip all processing for acrylics - render as-is
    if (activeMaterialType === "ACRYLIC") {
      return;
    }

    // Get material module for this type
    const materialModule = materialType.getActiveMaterialModule();
    if (!materialModule) {
      return;
    }
    if (!materialModule.classify || typeof materialModule.classify !== 'function') {
      return;
    }
    materialType.materialModuleRef.current = materialModule;
    materialProcessorRef.current.setMaterialModule(materialModule);

    // Re-apply materials using MaterialProcessor
    materialProcessorRef.current.updateMaterialsForType(model, {
      materialType: activeMaterialType,
      metalFinish: lighting.metalFinish,
      metalColor: materialType.metalColor,
      reflectionIntensity: lighting.reflectionIntensity,
    });

    // Update environment map for materials
    const envMap = environmentManagerRef.current?.getEnvironmentMap();
    if (materialModule.updateMaterials && envMap) {
      materialModule.updateMaterials(
        model,
        envMap,
        lighting.showReflections,
        lighting.reflectionIntensity,
        materialProcessorRef.current.getBaseEnvMapIntensities()
      );
    }
    
    // CRITICAL: Re-apply brightness to artwork layers, metal PBR for silver, and super white to white metal after material updates
    // This ensures artwork brightness, metal PBR for silver, and white metal super white persist even if materials were updated
    if (activeMaterialType === "METAL" || activeMaterialType === "METAL_BOX") {
      const metalColor = materialType.metalColor;
      const metalFinish = lighting.metalFinish;
      
      model.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const objName = obj.name || "";
        const objNameLower = objName.toLowerCase();
        
        // Re-apply artwork brightness and metal PBR for silver
        const isArtwork = objName === "Artwork_FullBleed" || 
                         objName === "Artwork_Shrunk" ||
                         (objNameLower.includes("artwork") && 
                          (objNameLower.includes("fullbleed") || objNameLower.includes("full_bleed") || objNameLower.includes("shrunk")));
        
        if (isArtwork) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((mat) => {
            if (mat.color) {
              // Apply brighter silver color for artwork visibility while maintaining metal blending
              if (metalColor === "brushed_silver") {
                mat.color.setRGB(1.5, 1.5, 1.55); // Very bright silver tint for artwork visibility while maintaining metal blending
              } else {
                mat.color.setRGB(0.5, 0.5, 0.5); // Re-apply moderate brightness for other metals
              }
            }
            
            // Re-apply metal PBR for silver artwork layer
            if (metalColor === "brushed_silver" && (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) {
              mat.metalness = 1.0; // Full metalness for complete metallic blending with metal layer
              
              // Set roughness and envMapIntensity based on metal finish - match metal layer appearance
              if (metalFinish === "polished") {
                mat.roughness = 0.05; // Very smooth, highly reflective (same as metal layer)
                mat.envMapIntensity = 0.1; // Very minimal environment reflections for polished
              } else {
                // brushed finish - match metal layer's fully matte appearance
                mat.roughness = 3.0; // Maximum roughness - fully matte like metal layer
                mat.envMapIntensity = 0.05; // Very minimal reflections for brushed finish
              }
              
              mat.envMap = null; // Use scene.environment
            }
            
            // Ensure transparency settings for alpha areas to show metal background
            mat.transparent = true;
            mat.opacity = 1.0;
            mat.alphaTest = 0.001; // Very small alpha test to help with transparency
            mat.depthWrite = false; // Critical: don't write to depth buffer so metal background shows through alpha
            mat.depthTest = true; // Enable depth testing for proper layering
            
            mat.needsUpdate = true;
          });
        }
        
        // Re-apply super white for white metal layers
        const isWhiteMetal = (objNameLower.includes("white") && objNameLower.includes("metal")) ||
                            objNameLower.includes("whitemetal");
        
        if (isWhiteMetal && metalColor === "white") {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((mat) => {
            if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
              if (mat.metalness !== undefined && mat.metalness > 0.4 && mat.color) {
                mat.color.setRGB(2.5, 2.5, 2.5); // Re-apply super white for white metal
                mat.needsUpdate = true;
              }
            }
          });
        }
      });
    }
  }, [materialType.selectedMaterialType, materialType.materialTypeOverride, lighting, modelManagerRef, sceneManagerRef, environmentManagerRef, materialProcessorRef, materialType]);

  // Toggle environment map - handled by material module (skip for acrylics)
  useEffect(() => {
    const scene = sceneManagerRef.current?.getScene();
    const envMap = environmentManagerRef.current?.getEnvironmentMap();
    const model = modelManagerRef.current?.getModel();
    if (!scene || !envMap || !materialType.materialModuleRef.current) return;

    // Update environment manager
    environmentManagerRef.current.setEnabled(lighting.showReflections);

    // Update materials using the material module's own update function
    const materialModule = materialType.materialModuleRef.current;
    const activeType = materialType.activeMaterialTypeRef.current;
    
    // Skip for acrylics - render as-is
    if (activeType === "ACRYLIC") return;
    
    if (materialModule.updateMaterials && model) {
      materialModule.updateMaterials(
        model,
        lighting.showReflections ? envMap : null,
        lighting.showReflections,
        lighting.reflectionIntensity,
        materialProcessorRef.current?.getBaseEnvMapIntensities() || new Map()
      );
    }
  }, [lighting.showReflections, lighting.reflectionIntensity, materialType.materialModuleRef, sceneManagerRef, environmentManagerRef, modelManagerRef, materialProcessorRef]);

  // Update acrylic exposure (makes emissive intensity respond to renderer exposure)
  useEffect(() => {
    const model = modelManagerRef.current?.getModel();
    const renderer = sceneManagerRef.current?.getRenderer();
    if (!model || !renderer) return;

    const activeType = materialType.activeMaterialTypeRef.current;
    
    // Only update exposure for acrylic materials
    if (activeType === "ACRYLIC" && materialType.materialModuleRef.current?.updateExposure) {
      materialType.materialModuleRef.current.updateExposure(model, renderer);
      
      // Force render update
      const scene = sceneManagerRef.current?.getScene();
      const camera = sceneManagerRef.current?.getCamera();
      if (scene && camera) {
        renderer.render(scene, camera);
      }
    }
  }, [lighting.exposure, materialType.materialModuleRef, modelManagerRef, sceneManagerRef]);
}
