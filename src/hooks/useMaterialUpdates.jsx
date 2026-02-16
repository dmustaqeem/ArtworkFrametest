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
      const renderer = sceneManagerRef.current?.getRenderer();
      materialModule.updateReflectionIntensity(
        model,
        lighting.reflectionIntensity,
        materialProcessorRef.current?.getBaseEnvMapIntensities() || new Map(),
        renderer
      );
    }
    // Animation loop handles rendering automatically - no need for manual render
  }, [lighting.reflectionIntensity]); // Refs are stable and don't need to be in dependencies

  // Update metal finish and color - handled by material module (only for METAL and METAL_BOX)
  // SINGLE SOURCE OF TRUTH: applyMetalState handles both finish and color changes
  useEffect(() => {
    const model = modelManagerRef.current?.getModel();
    if (!model || !materialType.materialModuleRef.current) return;

    const activeType = materialType.activeMaterialTypeRef.current;
    if (activeType !== "METAL" && activeType !== "METAL_BOX") {
      return;
    }

    const materialModule = materialType.materialModuleRef.current;
    if (materialModule.applyMetalState) {
      // Use single source of truth function - applyMetalState
      // This handles finish, color, AND reflectionIntensity changes (consolidated from separate effects)
      const renderer = sceneManagerRef.current?.getRenderer?.();
      materialModule.applyMetalState(model, renderer, {
        metalFinish: lighting.metalFinish,
        metalColor: materialType.metalColor ?? "brushed_silver", // Normalize to prevent null re-runs
        showReflections: lighting.showReflections,
        reflectionIntensity: lighting.reflectionIntensity,
      });
    }
  }, [
    materialType.activeMaterialType, // ✅ Correct dependency - source of truth
    materialType.metalColor,
    lighting.metalFinish,
    lighting.showReflections,
    lighting.reflectionIntensity,
    // Refs are stable and don't need to be in dependencies
  ]);

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
          if (process.env.NODE_ENV === 'development') {
            console.error("Failed to load HDRI for material type:", error);
          }
        }
      );
    }
    
    // Update previous material type
    previousMaterialTypeRef.current = activeMaterialType;
  }, [materialType.activeMaterialType]); // Only activeMaterialType triggers this effect; refs are stable

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
    const activeType = materialType.activeMaterialTypeRef.current;
    const rendererForUpdate = sceneManagerRef.current?.getRenderer();
    
    // For MIRROR: always call applyMirrorState (single source of truth)
    // Pass envMap explicitly so mirror materials can reflect the HDRI
    if (activeType === "MIRROR" && materialModule.applyMirrorState && rendererForUpdate) {
      const envMap = environmentManagerRef.current?.getEnvironmentMap();
      materialModule.applyMirrorState(model, rendererForUpdate, {
        reflectionIntensity: lighting.reflectionIntensity,
        showReflections: lighting.showReflections,
        baseEnvMapIntensities: materialProcessorRef.current?.getBaseEnvMapIntensities() || new Map(),
        envMap: envMap, // Explicitly pass the HDRI envMap
      });
      return;
    }
    
    if (materialModule.updateMaterials && envMap && rendererForUpdate) {
      materialModule.updateMaterials(
        model,
        envMap,
        lighting.showReflections,
        lighting.reflectionIntensity,
        materialProcessorRef.current.getBaseEnvMapIntensities(),
        rendererForUpdate
      );
    }
    
    // CRITICAL: Do NOT re-apply metal state here after updateMaterials
    // This causes timing issues and "original captured after already modified" bugs
    // Metal state is handled by the consolidated reactive effect above (handles all UI changes)
  }, [
    materialType.selectedMaterialType, 
    materialType.materialTypeOverride,
    lighting.metalFinish, // Only specific lighting properties needed
    lighting.reflectionIntensity,
    materialType.metalColor,
    // Refs are stable and don't need to be in dependencies
  ]);

  // Toggle environment map - handled by material module (skip for acrylics)
  useEffect(() => {
    const scene = sceneManagerRef.current?.getScene();
    const envMap = environmentManagerRef.current?.getEnvironmentMap();
    const model = modelManagerRef.current?.getModel();
    if (!scene || !envMap || !materialType.materialModuleRef.current) return;

    // Update environment manager|
    environmentManagerRef.current.setEnabled(lighting.showReflections);

    // Update materials using the material module's own update function
    const materialModule = materialType.materialModuleRef.current;
    const activeType = materialType.activeMaterialTypeRef.current;
    
    // Skip for acrylics - render as-is
    if (activeType === "ACRYLIC") return;
    
    if (materialModule.updateMaterials && model) {
      const renderer = sceneManagerRef.current?.getRenderer();
      materialModule.updateMaterials(
        model,
        lighting.showReflections ? envMap : null,
        lighting.showReflections,
        lighting.reflectionIntensity,
        materialProcessorRef.current?.getBaseEnvMapIntensities() || new Map(),
        renderer
      );
    }
  }, [lighting.showReflections, lighting.reflectionIntensity]); // Refs are stable and don't need to be in dependencies

  // Update acrylic exposure (makes emissive intensity respond to renderer exposure)
  useEffect(() => {
    const model = modelManagerRef.current?.getModel();
    const renderer = sceneManagerRef.current?.getRenderer();
    if (!model || !renderer) return;

    const activeType = materialType.activeMaterialTypeRef.current;
    
    // Only update exposure for acrylic materials
    if (activeType === "ACRYLIC" && materialType.materialModuleRef.current?.updateExposure) {
      materialType.materialModuleRef.current.updateExposure(model, renderer);
      // Animation loop handles rendering automatically - no need for manual render
    }
  }, [lighting.exposure]); // Refs are stable and don't need to be in dependencies
}
