import { useEffect } from "react";
import * as THREE from "three";
import { registerMaterialLightingDefaults } from "../materials/index.js";
import { createLightingManager } from "../lighting/index.jsx";
import {
  createSceneManager,
  createEnvironmentManager,
  createModelManager,
  createTextureManager,
  createMeshVisibilityManager,
  createMaterialProcessor,
} from "../managers/index.jsx";
import { MODEL_PATHS, SCENE_CONFIG, getHDRIPath, getDefaultReflectionIntensity } from "../config/appConfig.jsx";

/**
 * Custom hook to handle app initialization
 * Manages all manager creation and model loading
 */
function useAppInitialization({
  mountRef,
  materialType,
  textureLayersHook,
  meshVisibilityHook,
  lighting,
  setLoading,
  setError,
  setMaterialSummary,
  sceneManagerRef,
  environmentManagerRef,
  modelManagerRef,
  textureManagerRef,
  meshVisibilityManagerRef,
  materialProcessorRef,
  lightingManagerRef,
  testTexture1Ref,
  testTexture2Ref,
}) {
  useEffect(() => {
    if (!mountRef.current) return;

    // Initialize SceneManager
    const sceneManager = createSceneManager(mountRef.current, {
      toneMapping: THREE[SCENE_CONFIG.renderer.toneMapping],
      outputColorSpace: THREE[SCENE_CONFIG.renderer.outputColorSpace],
      initialCameraPosition: new THREE.Vector3(
        SCENE_CONFIG.camera.initialPosition.x,
        SCENE_CONFIG.camera.initialPosition.y,
        SCENE_CONFIG.camera.initialPosition.z
      ),
    });
    sceneManagerRef.current = sceneManager;
    sceneManager.setToneMappingExposure(lighting.exposure);
    sceneManager.startAnimation();

    const scene = sceneManager.getScene();
    const camera = sceneManager.getCamera();
    const renderer = sceneManager.getRenderer();
    const controls = sceneManager.getControls();

    // Initialize TextureManager
    const textureManager = createTextureManager(renderer);
    textureManagerRef.current = textureManager;

    // NOTE: Test texture loading removed - these hooks are not used in API mode
    // Test textures should only be loaded when explicitly needed, not during initialization

    // Initialize EnvironmentManager
    const environmentManager = createEnvironmentManager(scene, renderer);
    environmentManagerRef.current = environmentManager;

    // Initialize LightingManager
    const lightingManager = createLightingManager(scene, renderer);
    lightingManagerRef.current = lightingManager;

    // Register all material default lighting configurations
    registerMaterialLightingDefaults(lightingManager);

    // Initialize ModelManager
    const modelManager = createModelManager(scene, camera, controls);
    modelManagerRef.current = modelManager;

    // Initialize MeshVisibilityManager
    const meshVisibilityManager = createMeshVisibilityManager();
    meshVisibilityManagerRef.current = meshVisibilityManager;

    // Load HDRI environment map (use mirror-specific HDRI for mirrors)
    const activeMaterialType = materialType.activeMaterialType;
    const hdriPath = getHDRIPath(activeMaterialType);
    environmentManager.loadHDRI(
      hdriPath,
      (newEnvMap) => {
        // Update materials immediately when HDRI loads
        const model = modelManager.getModel();
        if (model && materialType.materialModuleRef.current && materialType.materialModuleRef.current.updateMaterials) {
          const activeType = materialType.activeMaterialTypeRef.current;
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
        setError(error);
      }
    );

    // Load GLB model
    materialType.activeMaterialTypeRef.current = activeMaterialType;
    materialType.setDetectedMaterialType(activeMaterialType);

    // Get material module for this type
    const materialModule = materialType.getActiveMaterialModule();
    if (!materialModule) {
      setError(`Material module not found for type: ${activeMaterialType}`);
      setLoading(false);
      return;
    }

    // Validate material module structure
    if (!materialModule.classify || typeof materialModule.classify !== 'function') {
      setError(`Material module for type ${activeMaterialType} is missing classify function`);
      setLoading(false);
      return;
    }
    if (!materialModule.preset) {
      setError(`Material module for type ${activeMaterialType} is missing preset object`);
      setLoading(false);
      return;
    }
    if (!materialModule.applyPreset || typeof materialModule.applyPreset !== 'function') {
      setError(`Material module for type ${activeMaterialType} is missing applyPreset function`);
      setLoading(false);
      return;
    }

    materialType.materialModuleRef.current = materialModule;

    // Initialize MaterialProcessor with error handling
    let materialProcessor;
    try {
      if (!materialModule || !materialModule.classify || !materialModule.preset || !materialModule.applyPreset) {
        setError(`Material module for type ${activeMaterialType} is invalid`);
        setLoading(false);
        return;
      }

      materialProcessor = createMaterialProcessor(materialModule, renderer);
      materialProcessorRef.current = materialProcessor;

      if (!materialProcessorRef.current) {
        setError("Failed to create MaterialProcessor");
        setLoading(false);
        return;
      }
    } catch (error) {
      setError(`Failed to create MaterialProcessor: ${error.message}`);
      setLoading(false);
      return;
    }

    // Apply material-specific default lighting through LightingManager
    if (lightingManagerRef.current) {
      lightingManagerRef.current.applyMaterialDefaults(activeMaterialType);
      const newLighting = lightingManagerRef.current.getLighting();
      lighting.setLighting(newLighting);
      // Set default reflectionIntensity based on material type
      const defaultReflectionIntensity = getDefaultReflectionIntensity(activeMaterialType);
      lighting.setReflectionIntensity(defaultReflectionIntensity);
    }

    // Load model (will be overridden by MaterialModelSelector if model path is provided)
    const initialModelPath = MODEL_PATHS.GLB;
    modelManager.loadModel(
      initialModelPath,
      (model, boundingBox) => {
        if (!materialProcessorRef.current) {
          setError("MaterialProcessor not initialized");
          setLoading(false);
          return;
        }

        // Collect meshes using MeshVisibilityManager
        const meshList = meshVisibilityManager.collectMeshes(model);
        meshVisibilityManager.applyVisibilityRelationships();
        meshVisibilityHook.setMeshes(meshList);

        // Process materials using MaterialProcessor
        const processOptions = {
          materialType: activeMaterialType,
          metalFinish: lighting.metalFinish,
          metalColor: materialType.metalColor,
          reflectionIntensity: lighting.reflectionIntensity,
          meshVisibilityManager: meshVisibilityManager,
        };
        
        const { materialDetails, textureLayers: layers } = materialProcessorRef.current.processModelMaterials(
          model,
          processOptions
        );

        // Store original textures and layers
        textureLayersHook.storeOriginalTextures(layers);
        textureLayersHook.setAllTextureLayers(layers);

        // Filter texture layers based on mesh visibility
        // For metals, mirrors, and acrylics, show all layers without filtering
        // For other materials, apply filtering
        const isMetal = activeMaterialType === "METAL" || activeMaterialType === "METAL_BOX";
        const isMirror = activeMaterialType === "MIRROR";
        const isAcrylic = activeMaterialType === "ACRYLIC";
        
        let filteredLayers;
        if (isMetal || isMirror || isAcrylic) {
          // For metals, mirrors, and acrylics: show all texture layers, no filtering
          filteredLayers = layers;
        } else {
          // Filter layers by visibility for other materials
          filteredLayers = meshVisibilityHook.filterTextureLayersByMeshVisibility(
            layers,
            meshVisibilityManager,
            activeMaterialType
          );
        }
        textureLayersHook.setTextureLayers(filteredLayers);

        // Generate material summary
        const byType = {};
        let totalMeshes = meshList.length;
        let totalMaterials = 0;
        materialDetails.forEach((detail) => {
          byType[detail.materialType] = (byType[detail.materialType] || 0) + 1;
          totalMaterials++;
        });
        setMaterialSummary({ totalMeshes, totalMaterials, byType });

        // Update materials with environment map if HDRI is already loaded
        const envMap = environmentManager.getEnvironmentMap();
        if (envMap && materialModule.updateMaterials) {
          const renderer = sceneManagerRef.current?.getRenderer();
          materialModule.updateMaterials(
            model,
            envMap,
            lighting.showReflections,
            lighting.reflectionIntensity,
            materialProcessor.getBaseEnvMapIntensities(),
            renderer
          );
        }

        setLoading(false);
      },
      (error) => {
        setError(error);
        setLoading(false);
      }
    );

    // Cleanup
    return () => {
      if (sceneManagerRef.current) {
        sceneManagerRef.current.dispose();
        sceneManagerRef.current = null;
      }
      if (environmentManagerRef.current) {
        environmentManagerRef.current.dispose();
        environmentManagerRef.current = null;
      }
      if (modelManagerRef.current) {
        modelManagerRef.current.dispose();
        modelManagerRef.current = null;
      }
      if (textureManagerRef.current) {
        textureManagerRef.current.dispose();
        textureManagerRef.current = null;
      }
      if (meshVisibilityManagerRef.current) {
        meshVisibilityManagerRef.current.clear();
        meshVisibilityManagerRef.current = null;
      }
      if (materialProcessorRef.current) {
        materialProcessorRef.current.dispose();
        materialProcessorRef.current = null;
      }
      if (lightingManagerRef.current) {
        lightingManagerRef.current.dispose();
        lightingManagerRef.current = null;
      }
    };
  }, []); // Only run once on mount
}

export { useAppInitialization };
