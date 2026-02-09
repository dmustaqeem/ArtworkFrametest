import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createSceneManager } from "../managers/SceneManager.jsx";
import { createEnvironmentManager } from "../managers/EnvironmentManager.jsx";
import { createModelManager } from "../managers/ModelManager.jsx";
import { createTextureManager } from "../managers/TextureManager.jsx";
import { createMeshVisibilityManager } from "../managers/MeshVisibilityManager.jsx";
import { createMaterialProcessor } from "../managers/MaterialProcessor.jsx";
import { createLightingManager } from "../lighting/index.jsx";
import { getMaterialModule, registerMaterialLightingDefaults } from "../materials/index.js";
import { MODEL_PATHS, SCENE_CONFIG, MATERIAL_CONFIG, getHDRIPath } from "../config/appConfig.jsx";

/**
 * Custom hook to initialize and manage Three.js scene and all managers
 */
export function useThreeScene(
  mountRef,
  {
    onModelLoad,
    onError,
    materialType,
    metalFinish,
    metalColor,
    reflectionIntensity,
    showReflections,
    lighting,
    setLighting,
    setEnvRotation,
    setError,
    setLoading,
    materialModuleRef,
    activeMaterialTypeRef,
  }
) {
  // Manager refs
  const sceneManagerRef = useRef(null);
  const environmentManagerRef = useRef(null);
  const modelManagerRef = useRef(null);
  const textureManagerRef = useRef(null);
  const meshVisibilityManagerRef = useRef(null);
  const materialProcessorRef = useRef(null);
  const lightingManagerRef = useRef(null);
  const testTexture1Ref = useRef(null);
  const testTexture2Ref = useRef(null);

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

    // Load test textures
    textureManager.loadTexture(MODEL_PATHS.TEST_IMAGES.IMAGE_1, (tex) => {
      testTexture1Ref.current = tex;
    });
    textureManager.loadTexture(MODEL_PATHS.TEST_IMAGES.IMAGE_2, (tex) => {
      testTexture2Ref.current = tex;
    });

    // Initialize EnvironmentManager
    const environmentManager = createEnvironmentManager(scene, renderer);
    environmentManagerRef.current = environmentManager;

    // Initialize LightingManager
    const lightingManager = createLightingManager(scene, renderer);
    lightingManagerRef.current = lightingManager;

    // Register all material default lighting configurations
    registerMaterialLightingDefaults(lightingManager);

    // Sync React state with LightingManager (for UI display)
    lightingManager.onLightingChange((newLighting) => {
      setLighting(newLighting);
    });
    lightingManager.onEnvRotationChange((newRotation) => {
      setEnvRotation(newRotation);
    });

    // Initial sync of state
    const initialLighting = lightingManager.getLighting();
    setLighting(initialLighting);
    setEnvRotation(lightingManager.getEnvironmentRotation());

    // Initialize ModelManager
    const modelManager = createModelManager(scene, camera, controls);
    modelManagerRef.current = modelManager;

    // Initialize MeshVisibilityManager
    const meshVisibilityManager = createMeshVisibilityManager();
    meshVisibilityManagerRef.current = meshVisibilityManager;

    // Load HDRI environment map (use mirror-specific HDRI for mirrors)
    const activeMaterialType = materialType || MATERIAL_CONFIG.DEFAULT_TYPE;
    const hdriPath = getHDRIPath(activeMaterialType);
    environmentManager.loadHDRI(
      hdriPath,
      (newEnvMap) => {
        // Update materials immediately when HDRI loads
        const model = modelManager.getModel();
        if (model && materialModuleRef.current && materialModuleRef.current.updateMaterials) {
          materialModuleRef.current.updateMaterials(
            model,
            newEnvMap,
            showReflections,
            reflectionIntensity,
            materialProcessorRef.current?.getBaseEnvMapIntensities() || new Map()
          );
        }
      },
      (error) => {
        if (onError) onError(error);
        if (setError) setError(error);
      }
    );

    // Get material module for this type
    activeMaterialTypeRef.current = activeMaterialType;

    const materialModule = getMaterialModule(activeMaterialType);
    if (!materialModule) {
      const error = `Material module not found for type: ${activeMaterialType}`;
      if (onError) onError(error);
      if (setError) setError(error);
      if (setLoading) setLoading(false);
      return;
    }

    // Validate material module structure
    if (!materialModule.classify || typeof materialModule.classify !== 'function') {
      const error = `Material module for type ${activeMaterialType} is missing classify function`;
      if (onError) onError(error);
      if (setError) setError(error);
      if (setLoading) setLoading(false);
      return;
    }
    if (!materialModule.preset) {
      const error = `Material module for type ${activeMaterialType} is missing preset object`;
      if (onError) onError(error);
      if (setError) setError(error);
      if (setLoading) setLoading(false);
      return;
    }
    if (!materialModule.applyPreset || typeof materialModule.applyPreset !== 'function') {
      const error = `Material module for type ${activeMaterialType} is missing applyPreset function`;
      if (onError) onError(error);
      if (setError) setError(error);
      if (setLoading) setLoading(false);
      return;
    }

    materialModuleRef.current = materialModule;

    // Initialize MaterialProcessor
    let materialProcessor;
    try {
      materialProcessor = createMaterialProcessor(materialModule, renderer);
      materialProcessorRef.current = materialProcessor;
    } catch (error) {
      const errorMsg = `Failed to create MaterialProcessor: ${error.message}`;
      if (onError) onError(errorMsg);
      if (setError) setError(errorMsg);
      if (setLoading) setLoading(false);
      return;
    }

    // Apply material-specific default lighting through LightingManager
    if (lightingManagerRef.current) {
      lightingManagerRef.current.applyMaterialDefaults(activeMaterialType);
      const newLighting = lightingManagerRef.current.getLighting();
      setLighting(newLighting);
    }

    // Load model
    modelManager.loadModel(
      MODEL_PATHS.GLB,
      (model, boundingBox) => {
        if (!materialProcessorRef.current) {
          const error = "MaterialProcessor not initialized";
          if (onError) onError(error);
          if (setError) setError(error);
          if (setLoading) setLoading(false);
          return;
        }

        // Collect meshes using MeshVisibilityManager
        const meshList = meshVisibilityManager.collectMeshes(model);
        meshVisibilityManager.applyVisibilityRelationships();

        // Process materials using MaterialProcessor
        const { materialDetails, textureLayers: layers } = materialProcessorRef.current.processModelMaterials(
          model,
          {
            materialType: activeMaterialType,
            metalFinish,
            metalColor,
            reflectionIntensity,
            meshVisibilityManager: meshVisibilityManager,
          }
        );

        // Call onModelLoad callback with all the data
        if (onModelLoad) {
          onModelLoad({
            model,
            boundingBox,
            meshList,
            layers,
            materialDetails,
            managers: {
              sceneManager,
              environmentManager,
              modelManager,
              textureManager,
              meshVisibilityManager,
              materialProcessor,
              lightingManager,
            },
            refs: {
              sceneManagerRef,
              environmentManagerRef,
              modelManagerRef,
              textureManagerRef,
              meshVisibilityManagerRef,
              materialProcessorRef,
              lightingManagerRef,
              testTexture1Ref,
              testTexture2Ref,
            },
          });
        }

        // Update materials with environment map if HDRI is already loaded
        const envMap = environmentManager.getEnvironmentMap();
        if (envMap && materialModule.updateMaterials) {
          materialModule.updateMaterials(
            model,
            envMap,
            showReflections,
            reflectionIntensity,
            materialProcessor.getBaseEnvMapIntensities()
          );
        }

        if (setLoading) setLoading(false);
      },
      (error) => {
        if (onError) onError(error);
        if (setError) setError(error);
        if (setLoading) setLoading(false);
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

  return {
    sceneManagerRef,
    environmentManagerRef,
    modelManagerRef,
    textureManagerRef,
    meshVisibilityManagerRef,
    materialProcessorRef,
    lightingManagerRef,
    testTexture1Ref,
    testTexture2Ref,
  };
}
