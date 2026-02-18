import { useEffect, useRef, useState, useImperativeHandle } from "react";
import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { registerMaterialLightingDefaults } from "../materials/index.js";
import { createLightingManager } from "../lighting/index.jsx";
import {
  createSceneManager,
  createEnvironmentManager,
  createModelManager,
  createTextureManager,
  createMeshVisibilityManager,
  createMaterialProcessor,
  createMeshCache,
} from "../managers/index.jsx";
import {
  useMaterialType,
  useTextureLayers,
  useMeshVisibility,
  useLighting,
  useMaterialUpdates,
} from "../hooks/index.jsx";
import { useTextureOperations } from "../hooks/useTextureOperations.jsx";
import { SCENE_CONFIG, MATERIAL_CONFIG, TEXTURE_CONFIG, MODEL_PATHS, getModelPath, getHDRIPath, getMaterialTypeInfo, ORIENTATION_TYPES, getDefaultReflectionIntensity } from "../config/appConfig.jsx";
import { TextureManager } from "../managers/TextureManager.jsx";
import { findArtworkTextureLayer, findTextureLayer, getTextureLayersForMode } from "../utils/textureUtils.jsx";
import { getArtworkMeshForMode, MODE_TYPES } from "../utils/meshUtils.jsx";
import { exportModelToUSDZ } from "../utils/usdzUtils.jsx";
import { applyTextureTransform, exportTextureFromCanvas } from "../utils/textureTransformUtils.jsx";
import { snapshotOriginalMetal } from "../materials/MetalMaterial.jsx";
import { applyMirrorState } from "../materials/MirrorMaterial.jsx";

/**
 * Core hook for ArtworkViewer
 * Manages Three.js scene, model loading, and state
 */
export function useArtworkViewer({
  mountRef,
  modelPath,
  hdriPath,
  materialType: materialTypeProp,
  metalFinish,
  metalColor,
  mode: modeProp,
  lighting: lightingProp,
  sceneConfig,
  filterBackTextures = true,
  textureLayerFilter,
  onReady,
  onError,
  onModeChange,
  onTextureUpdate,
  onLoadingProgress,
  apiRef,
}) {
  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentMode, setCurrentMode] = useState(modeProp || MODE_TYPES.FULL_BLEED);

  // Manager refs (must be defined before hooks that use them)
  const sceneManagerRef = useRef(null);
  const environmentManagerRef = useRef(null);
  const modelManagerRef = useRef(null);
  const textureManagerRef = useRef(null);
  const meshVisibilityManagerRef = useRef(null);
  const materialProcessorRef = useRef(null);
  const lightingManagerRef = useRef(null);
  const meshCacheRef = useRef(null);

  // Hooks
  const materialType = useMaterialType();
  const textureLayersHook = useTextureLayers();
  const meshVisibilityHook = useMeshVisibility();
  // Initialize reflectionIntensity based on material type
  const initialMaterialType = materialTypeProp || materialType.activeMaterialType || MATERIAL_CONFIG.DEFAULT_TYPE;
  const initialReflectionIntensity = getDefaultReflectionIntensity(initialMaterialType);
  const lighting = useLighting(lightingManagerRef, initialReflectionIntensity);

  // ============================
  // MIRROR REFLECTORS (planar)
  // ============================
  const MIRROR_REFLECTOR_TAG = "isMirrorReflector";

  const removeExistingMirrorReflectors = (model) => {
    if (!model) return;
    const toRemove = [];
    model.traverse((obj) => {
      if (obj.userData && obj.userData[MIRROR_REFLECTOR_TAG]) {
        toRemove.push(obj);
      }
    });
    toRemove.forEach((obj) => {
      if (obj.parent) {
        obj.parent.remove(obj);
      }
    });
  };

  const createMirrorReflectors = (model, options = {}) => {
    if (!model) return;

    const { textureSize = 1024 } = options;

    // Ensure we don't create duplicates on re-load
    removeExistingMirrorReflectors(model);

    // Make sure world matrices are up to date before baking transforms
    model.updateMatrixWorld(true);

    model.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry || !obj.name) return;

      const nameLower = obj.name.toLowerCase();
      const isMirrorPlane =
        nameLower === "mirror_fullbleed" ||
        nameLower === "mirror_shrunk";

      if (!isMirrorPlane) return;

      // Clone geometry and bake ONLY scale to avoid reflection stretching
      // Position and rotation will be copied to reflector transform
      const bakedGeo = obj.geometry.clone();
      const scaleMatrix = new THREE.Matrix4().makeScale(obj.scale.x, obj.scale.y, obj.scale.z);
      bakedGeo.applyMatrix4(scaleMatrix);

      const reflector = new Reflector(bakedGeo, {
        clipBias: 0.003,
        textureWidth: textureSize,
        textureHeight: textureSize,
        color: 0xffffff,
      });

      reflector.name = `${obj.name}_Reflector`;
      reflector.userData = {
        ...(reflector.userData || {}),
        [MIRROR_REFLECTOR_TAG]: true,
      };

      // Copy translation + rotation (keep scale = 1 because scale baked into geometry)
      reflector.position.copy(obj.position);
      reflector.quaternion.copy(obj.quaternion);
      reflector.scale.set(1, 1, 1);

      // Render on top of the original mirror surface
      reflector.renderOrder = (obj.renderOrder || 0) + 1;

      // MIRROR: Option A (PBR mirror) — keep original mirror mesh visible
      // Do NOT hide the original mesh - we're using PBR materials, not Reflector
      // obj.visible = false; // REMOVED - using PBR mirror instead

      // Add under same parent
      if (obj.parent) {
        obj.parent.add(reflector);
      }
    });
  };

  const syncMirrorReflectorVisibility = (model, mode) => {
    if (!model) return;
    const wantFullBleed = mode === MODE_TYPES.FULL_BLEED;
    const wantShrunk = mode === MODE_TYPES.SHRUNK;

    model.traverse((obj) => {
      if (!obj.userData || !obj.userData[MIRROR_REFLECTOR_TAG] || !obj.name) return;
      const n = obj.name.toLowerCase();
      if (n.includes("mirror_fullbleed")) {
        obj.visible = wantFullBleed;
      } else if (n.includes("mirror_shrunk")) {
        obj.visible = wantShrunk;
      }
    });
  };

  // ============================================
  // ACRYLIC: enforce artwork matte / glass glossy
  // ============================================
  const enforceAcrylicArtworkMatteGlassGlossy = (model, envMap, reflectionIntensity = 1.0) => {
    if (!model) return;

    model.traverse((obj) => {
      if (!obj.isMesh || !obj.material || !obj.name) return;

      const name = obj.name.toLowerCase();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

      const isArtwork =
        name === "artwork_fullbleed" ||
        name === "artwork_shrunk" ||
        (name.includes("artwork") &&
          (name.includes("fullbleed") || name.includes("full_bleed") || name.includes("shrunk")));

      const isGlass =
        name === "glass" ||
        name.includes("glass");

      // Artwork: reflective with clearcoat (HDR reflections) but colors stay sharp
      if (isArtwork) {
        mats.forEach((m) => {
          if (!m) return;
          
          // Ensure it's a PhysicalMaterial for clearcoat reflections
          if (!m.isMeshPhysicalMaterial && m.isMeshStandardMaterial) {
            // Upgrade to PhysicalMaterial if needed
            const upgraded = new THREE.MeshPhysicalMaterial();
            THREE.MeshStandardMaterial.prototype.copy.call(upgraded, m);
            Object.assign(m, upgraded);
            m.isMeshPhysicalMaterial = true;
          }
          
          // Keep base material properties for accurate colors
          if ("metalness" in m) m.metalness = 0.0; // Non-metallic to preserve colors
          
          // Low roughness base for some reflection, but clearcoat does most of the work
          if ("roughness" in m) m.roughness = 0.3; // Slight base reflection
          
          // Use scene.environment for HDR reflections
          m.envMap = null; // This makes it use scene.environment
          if ("envMapIntensity" in m) m.envMapIntensity = reflectionIntensity * 0.4; // Moderate intensity
          
          // Clearcoat for glossy HDR reflections without affecting base color
          if (m.isMeshPhysicalMaterial) {
            m.clearcoat = 1.0; // Maximum clearcoat for glossy reflections
            m.clearcoatRoughness = 0.0; // Zero for crisp HDR reflections
            m.transmission = 0.0; // No transmission
            m.thickness = 0.0;
            m.ior = 1.0;
          }
          
          // Remove distortion maps
          m.normalMap = null;
          m.bumpMap = null;
          m.displacementMap = null;
          
          // Keep texture map and color unchanged - colors stay sharp
          // m.map and m.color remain as they were
          
          // Depth settings
          m.depthWrite = true;
          m.depthTest = true;
          
          m.needsUpdate = true;
        });
      }

      // Glass: visible but transparent, non-reflective, doesn't affect artwork
      if (isGlass) {
        mats.forEach((m) => {
          if (!m) return;
          
          // Very low opacity - just enough to see edges, minimal white overlay
          m.transparent = true;
          m.opacity = 0.05; // Very low opacity - visible at edges but minimal white tint
          
          // No reflections at all
          m.envMap = null;
          if ("envMapIntensity" in m) m.envMapIntensity = 0.0;
          
          // No transmission - no blur on artwork
          if (m.isMeshPhysicalMaterial) {
            m.transmission = 0.0;
            m.thickness = 0.0;
            m.ior = 1.0;
            m.clearcoat = 0.0;
            m.clearcoatRoughness = 1.0;
          }
          
          // Matte - no specular highlights
          if ("metalness" in m) m.metalness = 0.0;
          if ("roughness" in m) m.roughness = 1.0;
          
          // Remove any maps that could affect appearance
          m.normalMap = null;
          m.bumpMap = null;
          m.displacementMap = null;
          
          // White color - but with very low opacity it won't tint much
          m.color.setRGB(1, 1, 1);
          
          // Use alphaTest to make it only visible at edges/thicker areas
          m.alphaTest = 0.01; // Only render where alpha is above threshold
          
          // Depth settings
          m.depthWrite = false;
          m.depthTest = true;
          m.side = THREE.DoubleSide; // Visible from both sides
          
          m.needsUpdate = true;
        });
      }
    });
  };
  // Helper: add a super‑white, non‑reflective, emissive base just under artwork for acrylics
  // This does NOT modify artwork materials or textures; it only adds a thin backing layer
  // under the Artwork_FullBleed and Artwork_Shrunk meshes (or Acrylic_FullBleed/Acrylic_Shrunk if they exist).
  const addAcrylicEmissiveBaseLayers = (meshVisibilityManager, activeMaterialType) => {
    if (!meshVisibilityManager || activeMaterialType !== "ACRYLIC") {
      return;
    }

    const meshes = meshVisibilityManager.getMeshes
      ? meshVisibilityManager.getMeshes()
      : meshVisibilityManager.meshes || [];

    if (!Array.isArray(meshes) || meshes.length === 0) {
      return;
    }

    meshes.forEach((info) => {
      const meshType = info.meshType;
      const parentMesh = info.mesh;

      // Target artwork meshes (Artwork_FullBleed/Artwork_Shrunk) for acrylic base layer
      // These are the meshes where textures are applied, so we need the base layer behind them
      // Also support acrylic substrate meshes if they exist (Acrylic_FullBleed/Acrylic_Shrunk)
      if (!parentMesh || !parentMesh.geometry) {
        return;
      }

      // Check for artwork meshes first (most common case)
      const isArtworkMesh = meshType === "fullBleed" || meshType === "shrunk";
      // Also check for acrylic substrate meshes if model has separate substrate layers
      const isAcrylicSubstrateMesh = meshType === "acrylicFullBleed" || meshType === "acrylicShrunk";

      if (!isArtworkMesh && !isAcrylicSubstrateMesh) {
        return;
      }

      // Get current acrylicBase brightness value (defaults to 3.0 for super white and more emissive)
      const baseIntensity =
        (lighting.lighting && typeof lighting.lighting.acrylicBase === "number"
          ? lighting.lighting.acrylicBase
          : 3.0);

      // Check if base layer already exists - update it instead of creating duplicate
      const existingBaseChild = parentMesh.children?.find(
        (child) => child.userData && child.userData.isAcrylicEmissiveBase
      );

      if (existingBaseChild) {
        // Update existing base layer material to ensure it stays white
        // CRITICAL: Base layer visibility must follow parent visibility
        // If parent is hidden (e.g., Artwork_Shrunk when in fullBleed mode), base should be hidden too
        existingBaseChild.visible = parentMesh.visible;
        if (existingBaseChild.material) {
          const mats = Array.isArray(existingBaseChild.material)
            ? existingBaseChild.material
            : [existingBaseChild.material];
          mats.forEach((m) => {
            // Super white color - brighter than pure white
            m.color?.setRGB(1.2, 1.2, 1.2); // Brighter than pure white (1.0) for super white
            m.emissive?.setRGB(1.0, 1.0, 1.0); // Pure white emissive
            m.emissiveIntensity = baseIntensity; // Higher intensity (3.0) for more emissive
            m.toneMapped = false;  // Critical: prevent ACES from greying it out
            m.envMap = null;
            m.envMapIntensity = 0.0; // No environment map influence - protects color
            m.roughness = 1.0; // Matte
            m.metalness = 0.0; // Non-metallic
            m.polygonOffset = true;
            m.polygonOffsetFactor = 2;  // Increased to push back more
            m.polygonOffsetUnits = 2;   // Increased to push back more
            m.depthWrite = true;  // Ensure depth write is enabled
            m.depthTest = true;
            m.transparent = false; // Opaque
            m.opacity = 1.0; // Full opacity
            m.side = THREE.DoubleSide; // Visible from both sides
            m.needsUpdate = true;
          });
        }
        return;
      }

      // Create new base layer with emissive material (super white, not tone-mapped)
      const baseMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(1.2, 1.2, 1.2),  // Brighter than pure white (1.0) for super white
        emissive: new THREE.Color(0xffffff),  // Pure white emissive
        emissiveIntensity: baseIntensity, // Higher intensity for more emissive
        roughness: 1.0,
        metalness: 0.0,
      });

      // IMPORTANT: don't let ACES tone mapping "grey" it out
      baseMaterial.toneMapped = false;

      // Ensure it never gets environment tint
      baseMaterial.envMap = null;
      baseMaterial.envMapIntensity = 0.0;

      // Avoid coplanar shimmer/z artifacts if it shares geometry
      // Use stronger polygonOffset to push base layer behind artwork
      baseMaterial.polygonOffset = true;
      baseMaterial.polygonOffsetFactor = 2;  // Increased to push back more
      baseMaterial.polygonOffsetUnits = 2;   // Increased to push back more

      // Transparency settings (keep solid white)
      baseMaterial.transparent = false;
      baseMaterial.opacity = 1.0;

      // Depth: write to depth buffer so it's visible, polygonOffset pushes it behind artwork
      baseMaterial.depthWrite = true;  // Must be true for base layer to be visible
      baseMaterial.depthTest = true;
      baseMaterial.side = THREE.DoubleSide;

      const baseMesh = new THREE.Mesh(parentMesh.geometry, baseMaterial);
      baseMesh.name = `AcrylicBase_${parentMesh.name || ""}`;
      // Lower renderOrder ensures it renders before the artwork (in opaque pass)
      baseMesh.renderOrder = (parentMesh.renderOrder || 0) - 1;
      // CRITICAL: Base layer visibility must follow parent visibility
      // If parent is hidden (e.g., Artwork_Shrunk when in fullBleed mode), base should be hidden too
      baseMesh.visible = parentMesh.visible;
      baseMesh.userData = {
        ...(baseMesh.userData || {}),
        isAcrylicEmissiveBase: true,
      };

      // Position the base layer slightly behind the artwork mesh (thin like paper)
      // Use a small offset to ensure it's behind the artwork surface
      const offset = 0.001;  // Increased from 0.0001 to ensure visibility
      // Offset in local Z direction (backward) - this works for most artwork meshes
      baseMesh.position.set(0, 0, -offset);

      // Attach as a child so visibility follows the artwork mesh
      // and it never extends to the physical back meshes.
      parentMesh.add(baseMesh);
    });
  };

  // Set material type from prop
  useEffect(() => {
    if (materialTypeProp) {
      materialType.setSelectedMaterialType(materialTypeProp);
    }
  }, [materialTypeProp]);

  // Set metal finish/color from props
  useEffect(() => {
    if (metalFinish) {
      lighting.setMetalFinish(metalFinish);
    }
    if (metalColor) {
      materialType.setMetalColor(metalColor);
    }
  }, [metalFinish, metalColor]);

  // Set lighting from props
  useEffect(() => {
    if (lightingProp) {
      lighting.setLighting(lightingProp);
    }
  }, [lightingProp]);

  // Initialize Three.js scene
  useEffect(() => {
    if (!mountRef.current) return;

    // Initialize SceneManager
    const sceneManager = createSceneManager(mountRef.current, {
      toneMapping: THREE[SCENE_CONFIG.renderer.toneMapping],
      outputColorSpace: THREE[SCENE_CONFIG.renderer.outputColorSpace],
      initialCameraPosition: sceneConfig?.cameraPosition
        ? new THREE.Vector3(
          sceneConfig.cameraPosition.x,
          sceneConfig.cameraPosition.y,
          sceneConfig.cameraPosition.z
        )
        : new THREE.Vector3(
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

    // Initialize managers
    const textureManager = createTextureManager(renderer);
    textureManagerRef.current = textureManager;

    const environmentManager = createEnvironmentManager(scene, renderer);
    environmentManagerRef.current = environmentManager;

    const lightingManager = createLightingManager(scene, renderer);
    lightingManagerRef.current = lightingManager;
    registerMaterialLightingDefaults(lightingManager);

    const modelManager = createModelManager(scene, camera, controls);
    modelManagerRef.current = modelManager;

    const meshVisibilityManager = createMeshVisibilityManager();
    meshVisibilityManagerRef.current = meshVisibilityManager;

    // Determine HDRI path
    const effectiveType =
      materialTypeProp ||
      materialType.activeMaterialTypeRef.current ||
      materialType.activeMaterialType ||
      MATERIAL_CONFIG.DEFAULT_TYPE;
    
    const hdriToLoad = hdriPath || getHDRIPath(effectiveType);
    
    // OPTIMIZATION: Start loading HDRI and model in parallel
    let hdriLoaded = false;
    let modelLoaded = false;
    let loadedModel = null;
    let loadedEnvMap = null;
    let activeMaterialTypeForFinalize = null;
    
    const checkAndApplyMaterials = () => {
      // Only apply materials when both are loaded
      if (!hdriLoaded || !modelLoaded || !loadedModel) return;
      
      const activeType = materialType.activeMaterialTypeRef.current;
      const materialModule = materialType.materialModuleRef.current;
      const renderer = sceneManagerRef.current?.getRenderer();

      if (!materialModule || !renderer) return;

      // For MIRROR: skip INIT load if setup() will handle it (prevents double-load)
      if (activeType === "MIRROR") {
        return;
      }

      // For acrylics: apply matte to artwork, glossy to glass
      if (activeType === "ACRYLIC" && materialModule.applyArtworkMatteGlassGlossy && loadedEnvMap) {
        materialModule.applyArtworkMatteGlassGlossy(
          loadedModel,
          loadedEnvMap,
          lighting.reflectionIntensity
        );
        enforceAcrylicArtworkMatteGlassGlossy(
          loadedModel,
          loadedEnvMap,
          lighting.reflectionIntensity
        );
      } else if (materialModule.updateMaterials && renderer && loadedEnvMap) {
        materialModule.updateMaterials(
          loadedModel,
          loadedEnvMap,
          lighting.showReflections,
          lighting.reflectionIntensity,
          materialProcessorRef.current?.getBaseEnvMapIntensities() || new Map(),
          renderer
        );
      }
    };
    
    const finalizeScene = () => {
      // Only finalize when both are loaded
      if (!hdriLoaded || !modelLoaded || !loadedModel) return;
      
      const activeType = activeMaterialTypeForFinalize || materialType.activeMaterialTypeRef.current;
      
      // Finalize scene setup
      if (activeType === "ACRYLIC" && loadedEnvMap) {
        enforceAcrylicArtworkMatteGlassGlossy(
          loadedModel,
          loadedEnvMap,
          lighting.reflectionIntensity
        );
      }

      setLoading(false);

      if (onReady && apiRef.current) {
        onReady(apiRef.current);
      }
    };
    
    // Start loading HDRI in parallel with model
    // NOTE: This initialization loading only happens if hdriPath is provided as a prop.
    // In API mode, hdriPath is NOT provided as a prop - setup() handles all asset loading.
    // This prevents double-loading: initialization loads if props provided, setup() loads in API mode.
    if (hdriToLoad) {
      environmentManager.loadHDRI(
        hdriToLoad,
        (newEnvMap) => {
          loadedEnvMap = newEnvMap;
          hdriLoaded = true;
          checkAndApplyMaterials();
          finalizeScene();
        },
        (err) => {
          setError(err);
          if (onError) onError(err);
        }
      );
    } else {
      // No HDRI to load, mark as loaded
      hdriLoaded = true;
      loadedEnvMap = environmentManager.getEnvironmentMap(); // Use existing if available
      if (process.env.NODE_ENV === 'development') {
        console.warn("[HDRI] No HDRI resolved", { hdriPath, effectiveType });
      }
      checkAndApplyMaterials();
      finalizeScene();
    }

    // Load model in parallel with HDRI
    // NOTE: This initialization loading only happens if modelPath is provided as a prop.
    // In API mode, modelPath is NOT provided as a prop - setup() handles all asset loading.
    // This prevents double-loading: initialization loads if props provided, setup() loads in API mode.
    if (modelPath) {
      const activeMaterialType = materialType.activeMaterialType;
      materialType.activeMaterialTypeRef.current = activeMaterialType;
      materialType.setDetectedMaterialType(activeMaterialType);

      const materialModule = materialType.getActiveMaterialModule();
      if (!materialModule) {
        const err = `Material module not found for type: ${activeMaterialType}`;
        setError(err);
        setLoading(false);
        if (onError) onError(err);
        return;
      }

      materialType.materialModuleRef.current = materialModule;

      // Create MaterialProcessor
      try {
        const materialProcessor = createMaterialProcessor(materialModule, renderer);
        materialProcessorRef.current = materialProcessor;

        // Apply default lighting
        if (lightingManagerRef.current) {
          lightingManagerRef.current.applyMaterialDefaults(activeMaterialType);
          const newLighting = lightingManagerRef.current.getLighting();
          lighting.setLighting(newLighting);
          // Set default reflectionIntensity based on material type
          const defaultReflectionIntensity = getDefaultReflectionIntensity(activeMaterialType);
          lighting.setReflectionIntensity(defaultReflectionIntensity);
        }

        // Load model in parallel with HDRI
        modelManager.loadModel(
          modelPath,
          (model, boundingBox) => {
            if (!materialProcessorRef.current) {
              const err = "MaterialProcessor not initialized";
              setError(err);
              setLoading(false);
              if (onError) onError(err);
              return;
            }

            loadedModel = model;
            modelLoaded = true;
            activeMaterialTypeForFinalize = activeMaterialType;

            // OPTIMIZATION: Show scene immediately, then process materials asynchronously
            // This allows the model to render while processing happens in background
            const processModelAsync = () => {
              // Build mesh cache for optimized lookups (eliminates repeated traversals)
              if (meshCacheRef.current) {
                meshCacheRef.current.buildCache(model);
              }

              // Collect meshes
              const meshList = meshVisibilityManager.collectMeshes(model);

              // Apply visibility relationships for all materials (including metals)
              meshVisibilityManager.applyVisibilityRelationships();

              meshVisibilityHook.setMeshes(meshList);

              // Process materials
              const processOptions = {
                materialType: activeMaterialType,
                metalFinish: lighting.metalFinish,
                metalColor: materialType.metalColor,
                reflectionIntensity: lighting.reflectionIntensity,
                meshVisibilityManager: meshVisibilityManager,
              };

              const { materialDetails, textureLayers: layers } =
                materialProcessorRef.current.processModelMaterials(model, processOptions);

              // Continue with rest of processing
              processTextureLayers(layers);
            };

            // OPTIMIZATION: Defer heavy processing to allow scene to render immediately
            // The model is already added to the scene by ModelManager, so it will render
            // while material processing happens in the background
            if (typeof requestIdleCallback !== 'undefined') {
              // Use requestIdleCallback for optimal performance - processes during idle time
              // Lower timeout (50ms) ensures processing starts quickly if browser is idle
              requestIdleCallback(processModelAsync, { timeout: 50 });
            } else {
              // Fallback: use requestAnimationFrame to yield to browser, then setTimeout
              requestAnimationFrame(() => {
                setTimeout(processModelAsync, 0);
              });
            }

            // Store reference for async processing
            const processTextureLayers = (layers) => {
              // Store texture layers
              textureLayersHook.storeOriginalTextures(layers);
              textureLayersHook.setAllTextureLayers(layers);

              // For metals, mirrors, and acrylics, show all layers without filtering
              const isMetal = activeMaterialType === "METAL" || activeMaterialType === "METAL_BOX";
              const isMirror = activeMaterialType === "MIRROR";
              const isAcrylic = activeMaterialType === "ACRYLIC";

              let filteredLayers;
              if (isMetal || isMirror || isAcrylic) {
                filteredLayers = layers;
              } else {
                filteredLayers = meshVisibilityManager.filterTextureLayersByMeshVisibility(
                  layers,
                  activeMaterialType
                );

                if (textureLayerFilter && typeof textureLayerFilter === 'function') {
                  filteredLayers = filteredLayers.filter(textureLayerFilter);
                } else if (filterBackTextures) {
                  filteredLayers = filteredLayers.filter((layer) => {
                    const meshName = (layer.meshName || "").toLowerCase();
                    const backKeywords = ["back", "rear", "behind"];
                    return !backKeywords.some(keyword => meshName.includes(keyword));
                  });
                }
              }

              textureLayersHook.setTextureLayers(filteredLayers);

              // For acrylics, add emissive base layers
              addAcrylicEmissiveBaseLayers(meshVisibilityManager, activeMaterialType);

              // Apply initial mode
              if (modeProp) {
                setMode(modeProp);
              }

              // MIRROR: Ensure mirror meshes are visible
              if (activeMaterialType === "MIRROR") {
                model.traverse((o) => {
                  if (!o.isMesh) return;
                  const n = (o.name || "").toLowerCase();
                  if (n === "mirror_fullbleed" || n === "mirror_shrunk") {
                    o.visible = true;
                  }
                });
              }

              // Check if both HDRI and model are loaded, then apply materials and finalize
              checkAndApplyMaterials();
              finalizeScene();
            };
          },
          (err) => {
            setError(err);
            setLoading(false);
            if (onError) onError(err);
          }
        );
      } catch (err) {
        setError(`Failed to create MaterialProcessor: ${err.message}`);
        setLoading(false);
        if (onError) onError(err);
      }
    }

    // Cleanup
    return () => {
      sceneManagerRef.current?.dispose();
      environmentManagerRef.current?.dispose();
      modelManagerRef.current?.dispose();
      textureManagerRef.current?.dispose();
      meshVisibilityManagerRef.current?.clear();
      materialProcessorRef.current?.dispose();
      lightingManagerRef.current?.dispose();
    };
  }, [modelPath, hdriPath, materialTypeProp]); // Re-run if paths or material type change

  // Material updates
  useMaterialUpdates({
    modelManagerRef,
    sceneManagerRef,
    environmentManagerRef,
    materialProcessorRef,
    materialType,
    lighting,
  });

  // Re‑enforce acrylic overrides whenever lighting / reflections change
  useEffect(() => {
    const activeType = materialType.activeMaterialTypeRef.current;
    if (activeType !== "ACRYLIC") return;

    const model = modelManagerRef.current?.getModel();
    const envMap = environmentManagerRef.current?.getEnvironmentMap();
    if (!model) return;

    enforceAcrylicArtworkMatteGlassGlossy(
      model,
      envMap,
      lighting.reflectionIntensity
    );
  }, [
    lighting.reflectionIntensity,
    lighting.showReflections,
    materialType.activeMaterialType,
  ]);

  // Texture operations
  const textureOperations = useTextureOperations({
    meshCacheRef,
    textureLayersHook,
    materialType,
    textureManagerRef,
    sceneManagerRef,
    testTexture1Ref: useRef(null),
    testTexture2Ref: useRef(null),
  });

  // Mode management
  const setMode = (newMode) => {
    if (!meshVisibilityManagerRef.current) return;

    const meshes = meshVisibilityManagerRef.current.getMeshes();
    const fullBleedMesh = getArtworkMeshForMode(meshes, MODE_TYPES.FULL_BLEED);
    const shrunkMesh = getArtworkMeshForMode(meshes, MODE_TYPES.SHRUNK);
    const frameMeshes = meshes.filter((m) => m.meshType === MODE_TYPES.FRAME);

    if (newMode === MODE_TYPES.FULL_BLEED) {
      // Show fullBleed, hide shrunk and frame
      if (fullBleedMesh) {
        if (fullBleedMesh.mesh) fullBleedMesh.mesh.visible = true;
        fullBleedMesh.visible = true; // Update meshVisibilityManager's visible property
      }
      if (shrunkMesh) {
        if (shrunkMesh.mesh) shrunkMesh.mesh.visible = false;
        shrunkMesh.visible = false; // Update meshVisibilityManager's visible property
      }
      frameMeshes.forEach((m) => {
        if (m.mesh) m.mesh.visible = false;
        m.visible = false; // Update meshVisibilityManager's visible property
      });
    } else if (newMode === MODE_TYPES.SHRUNK) {
      // Hide fullBleed, show shrunk and frame
      if (fullBleedMesh) {
        if (fullBleedMesh.mesh) fullBleedMesh.mesh.visible = false;
        fullBleedMesh.visible = false; // Update meshVisibilityManager's visible property
      }
      if (shrunkMesh) {
        if (shrunkMesh.mesh) shrunkMesh.mesh.visible = true;
        shrunkMesh.visible = true; // Update meshVisibilityManager's visible property
      }
      frameMeshes.forEach((m) => {
        if (m.mesh) m.mesh.visible = true;
        m.visible = true; // Update meshVisibilityManager's visible property
      });
    }

    // Apply visibility relationships to ensure all related meshes are updated
    // This will handle all background meshes (Wood_FullBleed, Wood_Shrunk, etc.)
    meshVisibilityManagerRef.current.applyVisibilityRelationships();

    // MIRROR: Option A (PBR mirror) — no reflector sync needed
    // Mirror meshes are controlled by mode visibility, not reflectors
    // (Mode visibility is handled by meshVisibilityManager)

    setCurrentMode(newMode);
    if (onModeChange) onModeChange(newMode);
  };

  // Update artwork texture
  const updateArtwork = async (texturePath, mode = null) => {
    const targetMode = mode || currentMode;
    const allLayers = textureLayersHook.allTextureLayersRef.current || [];

    const layer = findArtworkTextureLayer(allLayers, targetMode);

    if (!layer) {
      return false;
    }

    // Load texture
    return new Promise((resolve, reject) => {
      if (!textureManagerRef.current) {
        reject(new Error("TextureManager not initialized"));
        return;
      }

      textureManagerRef.current.loadTexture(
        texturePath,
        (texture) => {
          // Apply texture using texture operations
          const layerId = layer.id;
          // We need to adapt this to work with our texture operations
          // For now, apply directly
          const mesh = layer.mesh;
          if (!mesh || !mesh.material) {
            reject(new Error("Mesh or material not found"));
            return;
          }

          const mats = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          const mat = mats[layer.materialIndex];
          if (!mat) {
            reject(new Error("Material not found"));
            return;
          }

          // For metals and mirrors, use original texture without any processing
          const isMetal =
            materialType.activeMaterialTypeRef.current === "METAL" ||
            materialType.activeMaterialTypeRef.current === "METAL_BOX";
          const isMirror = materialType.activeMaterialTypeRef.current === "MIRROR";
          const isWood = materialType.activeMaterialTypeRef.current === "WOOD";
          const isAcrylic = materialType.activeMaterialTypeRef.current === "ACRYLIC";

          // For metals, apply texture to Artwork_FullBleed and Artwork_Shrunk (like acrylic)
          // No white color removal - using PNGs now
          const isFullBleed = layer.meshType === "fullBleed";
          const isShrunk = layer.meshType === "shrunk";
          const isFrame = layer.meshType === "frame";

          if (isMetal) {
            // Allow Artwork_FullBleed, Artwork_Shrunk, and frames
            if (!isFrame && !isFullBleed && !isShrunk) {
              // Skip other mesh types for metals
              resolve(false);
              return;
            }

            // For metals: just apply the texture directly, no processing (PNGs now, no white removal)
            // Dispose old texture to prevent remnants
            const originalTex = textureLayersHook.getOriginalTexture(layerId);
            if (mat.map && mat.map !== originalTex) {
              mat.map.dispose();
            }

            // Create texture with crisp settings for better quality and reduced grain
            const clonedTex = textureManagerRef.current
              ? textureManagerRef.current.createTextureFromImage(texture.image, {
                  flipY: false,
                  crisp: true, // Use crisp settings for better quality
                  maxAnisotropy: TEXTURE_CONFIG.MAX_ANISOTROPY,
                  useRepeatWrapping: false, // Use ClampToEdge for artwork
                  premultiplyAlpha: true, // Prevent edge halos
                })
              : (() => {
                const tex = new THREE.Texture(texture.image);
                const texWidth = texture.image?.naturalWidth || texture.image?.width || 0;
                const texHeight = texture.image?.naturalHeight || texture.image?.height || 0;
                const isPOT = texWidth > 0 && texHeight > 0 && 
                             TextureManager.isPowerOfTwo(texWidth) && 
                             TextureManager.isPowerOfTwo(texHeight);
                
                tex.wrapS = THREE.ClampToEdgeWrapping;
                tex.wrapT = THREE.ClampToEdgeWrapping;
                tex.generateMipmaps = isPOT; // Enable mipmaps for power-of-two textures
                tex.minFilter = isPOT ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.flipY = false;
                tex.premultiplyAlpha = true; // Prevent edge halos
                
                // Set anisotropy if renderer is available
                const renderer = sceneManagerRef.current?.getRenderer();
                if (renderer?.capabilities) {
                  tex.anisotropy = Math.min(
                    TEXTURE_CONFIG.MAX_ANISOTROPY,
                    renderer.capabilities.getMaxAnisotropy()
                  );
                }
                
                tex.needsUpdate = true;
                return tex;
              })();

            mat.map = clonedTex;
            
            // Ensure texture is properly configured for artwork (disable mipmaps to prevent white halo)
            if (mat.map) {
              // CRITICAL: Disable mipmaps for artwork textures to prevent white halo around small text
              // Mipmaps can create light fringes at distance, especially problematic for transparent PNGs
              mat.map.generateMipmaps = false;
              mat.map.minFilter = THREE.LinearFilter; // No mipmaps - prevents halo
              mat.map.magFilter = THREE.LinearFilter;
              mat.map.premultiplyAlpha = true; // Test this on/off - may help with edge pixels
              
              // Set anisotropy if renderer is available
              const renderer = sceneManagerRef.current?.getRenderer();
              if (renderer?.capabilities) {
                mat.map.anisotropy = Math.min(
                  TEXTURE_CONFIG.MAX_ANISOTROPY,
                  renderer.capabilities.getMaxAnisotropy()
                );
              }
              
              mat.map.needsUpdate = true;
            }
            
            // CRITICAL: ONLY assign texture + transparency settings - ALL metal PBR properties come from MetalMaterial.applyMetalState()
            // This ensures true centralized control - no property overrides here
            
            // Apply transparency settings for alpha areas to show metal background
            // Use alphaToCoverage to reduce white halo around text edges
            // This is artwork overlay policy, not metal PBR, so it's safe to set here
            mat.transparent = true;
            mat.opacity = 1.0;
            mat.alphaTest = 0.08; // Higher threshold to remove white fringe pixels (0.05-0.15 range)
            mat.alphaToCoverage = true; // Important: reduces fringes while keeping edges smooth (needs MSAA)
            mat.depthWrite = false; // Critical: don't write to depth buffer so metal background shows through alpha
            mat.depthTest = true; // Enable depth testing for proper layering

            mat.needsUpdate = true;
            
            // CRITICAL: Do NOT re-apply metal state here after texture update
            // This causes re-traversal and can reset render states mid-mutation
            // Metal state is handled by initial apply (after model load) and reactive updates (UI changes)
          } else if (isMirror) {
            // Allow Artwork_FullBleed, Artwork_Shrunk, and frames
            if (!isFrame && !isFullBleed && !isShrunk) {
              // Skip other mesh types for mirrors
              resolve(false);
              return;
            }

            // For mirrors: just apply the texture directly, no processing (PNGs now, no white removal)
            // Dispose old texture to prevent remnants
            const originalTex = textureLayersHook.getOriginalTexture(layerId);
            if (mat.map && mat.map !== originalTex) {
              mat.map.dispose();
            }

            // Create texture from original image (no processing)
            const clonedTex = textureManagerRef.current
              ? textureManagerRef.current.createTextureFromImage(texture.image, { flipY: false })
              : (() => {
                const tex = new THREE.Texture(texture.image);
                tex.wrapS = THREE.ClampToEdgeWrapping;
                tex.wrapT = THREE.ClampToEdgeWrapping;
                tex.generateMipmaps = false;
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.flipY = false;
                tex.needsUpdate = true;
                return tex;
              })();

            mat.map = clonedTex;

            // For mirrors: Apply centralized mirror state (single source of truth)
            // MirrorMaterial.jsx owns all PBR properties, render flags, and transparency settings
            if (isMirror && (isFullBleed || isShrunk)) {
              // Store original material properties BEFORE modifying them (for reset functionality)
              if (!textureLayersHook.getOriginalMaterialProperties(layerId)) {
                textureLayersHook.storeOriginalMaterialProperties(layerId, mat);
              }

              // Clear reflection-related maps (preset will handle PBR properties)
              mat.normalMap = null;
              mat.roughnessMap = null;
              mat.metalnessMap = null;
              mat.clearcoatMap = null;
              mat.clearcoatNormalMap = null;
              mat.clearcoatRoughnessMap = null;
              mat.sheenColorMap = null;
              mat.sheenRoughnessMap = null;

              // Apply centralized mirror state (single source of truth)
              const renderer = sceneManagerRef.current?.getRenderer();
              const model = modelManagerRef.current?.getModel();

              if (model && renderer) {
                const base = materialProcessorRef.current?.getBaseEnvMapIntensities?.();
                const envMap = environmentManagerRef.current?.getEnvironmentMap();
                applyMirrorState(model, renderer, {
                  reflectionIntensity: lighting.reflectionIntensity,
                  showReflections: lighting.showReflections,
                  baseEnvMapIntensities: base,
                  envMap: envMap, // Explicitly pass the HDRI envMap
                });
              } else {
                // Fallback: if refs not available, at least mark needsUpdate
                mat.needsUpdate = true;
              }
            } else {
              // For frames or other meshes, just update the texture
              mat.needsUpdate = true;
            }
          } else {
            // For non-metals: apply processing as before
            // Dispose old texture to prevent remnants

            
            const originalTex = textureLayersHook.getOriginalTexture(layerId);
            if (mat.map && mat.map !== originalTex) {
              mat.map.dispose();
            }

            // Check if we need to apply white color removal for Artwork_FullBleed or Wood_FullBleed in wood mode
            const isArtworkFullBleed = layer.meshType === "fullBleed" ||
              (layer.meshName && layer.meshName.toLowerCase().includes("artwork") &&
                (layer.meshName.toLowerCase().includes("fullbleed") || layer.meshName.toLowerCase().includes("full_bleed")));
            const isWoodFullBleed = layer.meshName && layer.meshName.toLowerCase().includes("wood") &&
              (layer.meshName.toLowerCase().includes("fullbleed") || layer.meshName.toLowerCase().includes("full_bleed"));
            const isFullBleedMesh = isArtworkFullBleed || isWoodFullBleed;

            let processedImage = texture.image;

            // For wood: Copy wood texture properties from corresponding wood background mesh
            if (isWood && (isFullBleed || isShrunk)) {
              // Find the corresponding wood background mesh (Wood_FullBleed or Wood_Shrunk)
              let woodMatForColor = null; // Always from FullBleed for color consistency
              let woodMatForMaps = null;  // From corresponding mesh (fullBleed or shrunk)
              const scene = sceneManagerRef.current?.getScene();

              if (scene) {
                scene.traverse((obj) => {
                  if (obj.isMesh && obj.material) {
                    const objNameLower = (obj.name || "").toLowerCase();

                    // Always find FullBleed for color (ensures consistency)
                    if (!woodMatForColor) {
                      const shouldMatchFullBleed = objNameLower.includes("wood") &&
                        (objNameLower.includes("fullbleed") || objNameLower.includes("full_bleed")) &&
                        !objNameLower.includes("artwork");

                      if (shouldMatchFullBleed) {
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        mats.forEach((m) => {
                          // Get the wood background material (not artwork material)
                          if (!m.map || (m.map && !objNameLower.includes("artwork"))) {
                            woodMatForColor = m;
                          }
                        });
                      }
                    }

                    // Find corresponding mesh for PBR maps (fullBleed or shrunk)
                    if (!woodMatForMaps) {
                      let shouldMatch = false;
                      if (isFullBleed) {
                        shouldMatch = objNameLower.includes("wood") &&
                          (objNameLower.includes("fullbleed") || objNameLower.includes("full_bleed")) &&
                          !objNameLower.includes("artwork");
                      } else if (isShrunk) {
                        shouldMatch = objNameLower.includes("wood") &&
                          (objNameLower.includes("shrunk") || objNameLower.includes("shrink")) &&
                          !objNameLower.includes("artwork");
                      }

                      if (shouldMatch) {
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        mats.forEach((m) => {
                          // Get the wood background material (not artwork material)
                          if (!m.map || (m.map && !objNameLower.includes("artwork"))) {
                            woodMatForMaps = m;
                          }
                        });
                      }
                    }
                  }
                });
              }

              // Copy wood texture properties if found
              if (woodMatForMaps || woodMatForColor) {
                // Copy PBR maps from corresponding mesh (fullBleed or shrunk)
                if (woodMatForMaps) {
                  if (woodMatForMaps.normalMap) {
                    mat.normalMap = woodMatForMaps.normalMap;
                    if (mat.normalScale && woodMatForMaps.normalScale) {
                      mat.normalScale.copy(woodMatForMaps.normalScale);
                    }
                  }
                  if (woodMatForMaps.roughnessMap) {
                    mat.roughnessMap = woodMatForMaps.roughnessMap;
                  }
                  if (woodMatForMaps.metalnessMap) {
                    mat.metalnessMap = woodMatForMaps.metalnessMap;
                  }
                  if (woodMatForMaps.aoMap) {
                    mat.aoMap = woodMatForMaps.aoMap;
                    if (woodMatForMaps.aoMapIntensity !== undefined) {
                      mat.aoMapIntensity = woodMatForMaps.aoMapIntensity;
                    }
                  }
                  if (woodMatForMaps.emissiveMap) {
                    mat.emissiveMap = woodMatForMaps.emissiveMap;
                  }

                  // Copy material properties for wood finish
                  if (woodMatForMaps.roughness !== undefined) {
                    mat.roughness = woodMatForMaps.roughness;
                  }
                  if (woodMatForMaps.metalness !== undefined) {
                    mat.metalness = woodMatForMaps.metalness;
                  }

                  // Copy environment map and intensity for reflections
                  if (woodMatForMaps.envMap) {
                    mat.envMap = woodMatForMaps.envMap;
                  }
                  if (woodMatForMaps.envMapIntensity !== undefined) {
                    mat.envMapIntensity = woodMatForMaps.envMapIntensity;
                  }
                }

                // ALWAYS copy color from FullBleed mesh (ensures consistency between fullBleed and shrunk)
                if (woodMatForColor && woodMatForColor.color) {
                  mat.color.copy(woodMatForColor.color);
                } else if (woodMatForMaps && woodMatForMaps.color) {
                  // Fallback: use color from corresponding mesh if FullBleed not found
                  mat.color.copy(woodMatForMaps.color);
                }
              }

              // Apply minimal transparency settings (matching working test app, same as metals)
              mat.transparent = true;
              mat.opacity = 1.0;
              mat.alphaTest = 0.001; // Very small alpha test (matches working app)
              mat.depthWrite = true; // Proper depth rendering (matches working app)
              // Don't set side property - let material use its original setting
            }

            // Create texture from image (no processing)
            const clonedTex = textureManagerRef.current
              ? textureManagerRef.current.createTextureFromImage(processedImage, { flipY: false })
              : (() => {
                const tex = new THREE.Texture(processedImage);
                tex.wrapS = THREE.ClampToEdgeWrapping;
                tex.wrapT = THREE.ClampToEdgeWrapping;
                tex.generateMipmaps = false;
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.needsUpdate = true;
                return tex;
              })();

            mat.map = clonedTex;

            // Preserve original material properties
          }

          mat.needsUpdate = true;

          // Animation loop handles rendering automatically - no need for manual render

          // For acrylics: Ensure super-white emissive base layer exists after texture update
          // This is critical for API mode where textures are applied after initial setup
          if (isAcrylic && meshVisibilityManagerRef.current) {
            const activeMaterialType = materialType.activeMaterialTypeRef.current;
            addAcrylicEmissiveBaseLayers(meshVisibilityManagerRef.current, activeMaterialType);

            // Also re-enforce matte artwork / glossy glass after artwork update
            const model = modelManagerRef.current?.getModel();
            const envMap = environmentManagerRef.current?.getEnvironmentMap();
            if (model) {
              enforceAcrylicArtworkMatteGlassGlossy(
                model,
                envMap,
                lighting.reflectionIntensity
              );
            }
          }

          if (onTextureUpdate) {
            onTextureUpdate(layer.id, texturePath);
          }

          resolve(true);
        },
        (err) => {
          reject(err);
        }
      );
    });
  };

  // Reset texture to original
  const resetTexture = (identifier) => {
    const layer = findTextureLayer(
      textureLayersHook.allTextureLayersRef.current,
      identifier
    );
    if (!layer || !layer.mesh) {
      return false;
    }

    const originalTex = textureLayersHook.getOriginalTexture(layer.id);
    if (!originalTex) {
      return false;
    }

    const mesh = layer.mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const mat = mats[layer.materialIndex];
    if (!mat) {
      return false;
    }

    // Restore original texture
    mat[layer.mapType] = originalTex;

    // For mirror materials: also restore original material properties
    const isMirror = materialType.activeMaterialTypeRef.current === "MIRROR";
    const isFullBleed = layer.meshType === "fullBleed";
    const isShrunk = layer.meshType === "shrunk";

    if (isMirror && (isFullBleed || isShrunk)) {
      textureLayersHook.restoreOriginalMaterialProperties(layer.id, mat);
    }

    mat.needsUpdate = true;

    // Animation loop handles rendering automatically - no need for manual render
    return true;
  };

  // Reset artwork for a mode
  const resetArtwork = (mode = null) => {
    const targetMode = mode || currentMode;
    const layer = findArtworkTextureLayer(
      textureLayersHook.allTextureLayersRef.current,
      targetMode
    );
    if (layer) {
      return resetTexture(layer.meshName);
    }
    return false;
  };

  // Batch update textures
  const updateTextures = async (texturesMap) => {
    const updates = Object.entries(texturesMap).map(([identifier, texturePath]) =>
      updateTexture(identifier, texturePath).catch((err) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`Failed to update texture ${identifier}:`, err);
        }
        return null;
      })
    );
    await Promise.all(updates);
  };

  // Apply texture transform
  const transformTexture = async (
    identifier,
    transform,
    selectionRect = null,
    outputSize = { width: 2048, height: 2048 }
  ) => {
    const layer = findTextureLayer(
      textureLayersHook.allTextureLayersRef.current,
      identifier
    );
    if (!layer) {
      throw new Error(`Texture layer not found: ${identifier}`);
    }

    // Get current texture image
    const mesh = layer.mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const mat = mats[layer.materialIndex];
    if (!mat || !mat.map) {
      throw new Error("Material or texture not found");
    }

    const currentTexture = mat.map;
    let imageSource = currentTexture.image;

    // If no image, try to get from texture source
    if (!imageSource && currentTexture.source) {
      imageSource = currentTexture.source.data;
    }

    if (!imageSource) {
      throw new Error("Cannot get image from texture");
    }

    // Apply transform
    const transformedCanvas = await applyTextureTransform(
      imageSource,
      transform,
      selectionRect,
      outputSize.width,
      outputSize.height
    );

    // Create new texture from canvas
    const newTexture = textureManagerRef.current
      ? textureManagerRef.current.createTextureFromImage(transformedCanvas, { flipY: false })
      : (() => {
        const tex = new THREE.Texture(transformedCanvas);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.needsUpdate = true;
        return tex;
      })();

    mat.map = newTexture;
    mat.needsUpdate = true;

    // Animation loop handles rendering automatically - no need for manual render
    return true;
  };

  // Get material summary
  const getMaterialSummary = () => {
    const meshes = meshVisibilityManagerRef.current?.getMeshes() || [];
    const layers = textureLayersHook.allTextureLayersRef.current || [];

    const byType = {};
    let totalMaterials = 0;

    layers.forEach((layer) => {
      const category = layer.materialCategory || "UNKNOWN";
      byType[category] = (byType[category] || 0) + 1;
      totalMaterials++;
    });

    return {
      totalMeshes: meshes.length,
      totalMaterials,
      byType,
      detectedMaterialType: materialType.detectedMaterialType,
    };
  };

  // Force renderer update
  // forceRender is no longer needed - animation loop handles rendering automatically
  const forceRender = () => {
    // No-op: Animation loop in SceneManager handles all rendering
    // This function is kept for API compatibility but does nothing
  };

  // ============================================
  // SIMPLIFIED API FUNCTIONS
  // ============================================

  // Setup function - initialize everything
  const setup = async (options = {}) => {
    const {
      orientation,
      modelPath: newModelPath,
      artworkTexture,
      materialType: newMaterialType,
      frameTexture,
      hdriPath: customHdriPath, // Custom HDR path (optional)
      mode: initialMode = MODE_TYPES.FULL_BLEED,
    } = options;

    try {
      // Validate required parameters
      if (!artworkTexture) {
        throw new Error("artworkTexture is required. Please provide a path or URL to the artwork image.");
      }
      
      if (!orientation) {
        throw new Error("orientation is required. Please provide 'portrait' or 'landscape'");
      }
      
      if (!newMaterialType) {
        throw new Error("materialType is required. Please provide one of: ACRYLIC, METAL, METAL_BOX, WOOD, MIRROR");
      }

      // Validate orientation
      if (orientation !== ORIENTATION_TYPES.PORTRAIT && orientation !== ORIENTATION_TYPES.LANDSCAPE) {
        throw new Error(`Invalid orientation: ${orientation}. Must be 'portrait' or 'landscape'`);
      }

      // 1. Set material type first (before model load if needed)
      materialType.setSelectedMaterialType(newMaterialType);

      // 2. Auto-select model path based on orientation and material type if not provided
      let finalModelPath = newModelPath;
      if (!finalModelPath) {
        // getModelPath now requires orientation and accepts both display types (METAL_SILVER) and internal types (METAL)
        finalModelPath = getModelPath(orientation, newMaterialType);
        if (!finalModelPath) {
          throw new Error(`Could not determine model path for orientation: ${orientation}, material type: ${newMaterialType}`);
        }
      }

      // 3. Load/reload model
      if (finalModelPath) {
        if (!modelManagerRef.current) {
          throw new Error("ModelManager not initialized. Please wait for viewer to initialize.");
        }

        const model = modelManagerRef.current.getModel();

        // Remove existing model if present
        if (model) {
          modelManagerRef.current.removeModel();
        }

        // Get active material type and ensure MaterialProcessor exists
        const activeMaterialType = newMaterialType || materialType.activeMaterialType;
        materialType.activeMaterialTypeRef.current = activeMaterialType;
        materialType.setDetectedMaterialType(activeMaterialType);
        
        // CRITICAL: For METAL_BOX, determine metalColor from model path BEFORE model loads
        // This ensures METAL_BOX_SILVER models use silver and METAL_BOX_WHITE models use white
        // This must happen before mesh cache is built so detection uses correct color
        if (activeMaterialType === "METAL_BOX") {
          const modelPathLower = (finalModelPath || "").toLowerCase();
          // Check model path first (most reliable)
          if (modelPathLower.includes("silver") && materialType.metalColor !== "brushed_silver") {
            materialType.setMetalColor("brushed_silver");
          } else if (modelPathLower.includes("white") && materialType.metalColor !== "white") {
            materialType.setMetalColor("white");
          } else if (!materialType.metalColor || materialType.metalColor === MATERIAL_CONFIG.METAL_FINISH) {
            // Default to silver if path doesn't indicate white
            materialType.setMetalColor("brushed_silver");
          }
        }

        const materialModule = materialType.getActiveMaterialModule();
        if (!materialModule) {
          throw new Error(`Material module not found for type: ${activeMaterialType}`);
        }
        materialType.materialModuleRef.current = materialModule;

        // Get renderer from scene manager
        const renderer = sceneManagerRef.current?.getRenderer();
        if (!renderer) {
          throw new Error("Renderer not initialized. Please wait for viewer to initialize.");
        }

        // Dispose old MaterialProcessor if it exists
        if (materialProcessorRef.current) {
          materialProcessorRef.current.dispose();
        }

        // Create MaterialProcessor for the material type
        try {
          const materialProcessor = createMaterialProcessor(materialModule, renderer);
          materialProcessorRef.current = materialProcessor;
        } catch (err) {
          throw new Error(`Failed to create MaterialProcessor: ${err.message}`);
        }

        // Apply default lighting
        if (lightingManagerRef.current) {
          lightingManagerRef.current.applyMaterialDefaults(activeMaterialType);
          const newLighting = lightingManagerRef.current.getLighting();
          lighting.setLighting(newLighting);
          // Set default reflectionIntensity based on material type
          const defaultReflectionIntensity = getDefaultReflectionIntensity(activeMaterialType);
          lighting.setReflectionIntensity(defaultReflectionIntensity);
        }

        // Load the new model and process materials
        await new Promise((resolve, reject) => {
          modelManagerRef.current.loadModel(
            finalModelPath,
            (loadedModel, boundingBox) => {
              if (!materialProcessorRef.current) {
                reject(new Error("MaterialProcessor not initialized"));
                return;
              }

              // CRITICAL: Snapshot original metal properties IMMEDIATELY after GLTF load
              // Must be called BEFORE any preset system or material processing touches materials
              // This preserves true original values before any mutations
              if (activeMaterialType === "METAL" || activeMaterialType === "METAL_BOX") {
                snapshotOriginalMetal(loadedModel);
              }

              // Collect meshes
              const meshList = meshVisibilityManagerRef.current.collectMeshes(loadedModel);

              // Apply visibility relationships
              meshVisibilityManagerRef.current.applyVisibilityRelationships();

              meshVisibilityHook.setMeshes(meshList);

              // Process materials (this creates texture layers)
              const processOptions = {
                materialType: activeMaterialType,
                metalFinish: lighting.metalFinish,
                metalColor: materialType.metalColor,
                reflectionIntensity: lighting.reflectionIntensity,
                meshVisibilityManager: meshVisibilityManagerRef.current,
              };

              const { materialDetails, textureLayers: layers } =
                materialProcessorRef.current.processModelMaterials(loadedModel, processOptions);

              // Store texture layers
              textureLayersHook.storeOriginalTextures(layers);
              textureLayersHook.setAllTextureLayers(layers);

              // Filter layers based on material type
              const isMetal = activeMaterialType === "METAL" || activeMaterialType === "METAL_BOX";
              const isMirror = activeMaterialType === "MIRROR";
              const isAcrylic = activeMaterialType === "ACRYLIC";

              let filteredLayers;
              if (isMetal || isMirror || isAcrylic) {
                filteredLayers = layers;
              } else {
                filteredLayers = meshVisibilityManagerRef.current.filterTextureLayersByMeshVisibility(
                  layers,
                  activeMaterialType
                );
              }

              textureLayersHook.setTextureLayers(filteredLayers);

              // For acrylics, add a super‑white emissive base under the artwork surfaces
              addAcrylicEmissiveBaseLayers(meshVisibilityManagerRef.current, activeMaterialType);

              // CRITICAL: For metals, apply centralized state immediately after material processing
              // This ensures all PBR properties come from METAL_FINISH_PRESETS (single source of truth)
              // This is the ONLY initial apply - reactive updates are handled by useMaterialUpdates hook
              if ((activeMaterialType === "METAL" || activeMaterialType === "METAL_BOX") && materialModule.applyMetalState) {
                const renderer = sceneManagerRef.current?.getRenderer();
                materialModule.applyMetalState(loadedModel, renderer, {
                  metalFinish: lighting.metalFinish,
                  metalColor: materialType.metalColor ?? "brushed_silver", // Normalize to prevent null re-runs
                  showReflections: lighting.showReflections,
                  reflectionIntensity: lighting.reflectionIntensity,
                });
              }

              // Defer material updates with environment map to allow initial render
              // This significantly speeds up setup, especially for mirror mode
              const envMap = environmentManagerRef.current?.getEnvironmentMap();
              if (envMap) {
                // Use setTimeout to defer material updates, allowing scene to render first
                setTimeout(() => {
                  if (activeMaterialType === "ACRYLIC") {
                    // For acrylics: apply matte to artwork, glossy to glass
                    if (materialModule.applyArtworkMatteGlassGlossy) {
                      materialModule.applyArtworkMatteGlassGlossy(
                        loadedModel,
                        envMap,
                        lighting.reflectionIntensity
                      );
                    }
                  } else {
                    const renderer = sceneManagerRef.current?.getRenderer();
                    
                    // For MIRROR: always call applyMirrorState (single source of truth)
                    // Pass envMap explicitly so mirror materials can reflect the HDRI
                    if (activeMaterialType === "MIRROR" && materialModule.applyMirrorState && renderer) {
                      materialModule.applyMirrorState(loadedModel, renderer, {
                        reflectionIntensity: lighting.reflectionIntensity,
                        showReflections: lighting.showReflections,
                        baseEnvMapIntensities: materialProcessorRef.current.getBaseEnvMapIntensities(),
                        envMap: envMap, // Explicitly pass the HDRI envMap
                      });
                    } else if (materialModule.updateMaterials && renderer) {
                      materialModule.updateMaterials(
                        loadedModel,
                        envMap,
                        lighting.showReflections,
                        lighting.reflectionIntensity,
                        materialProcessorRef.current.getBaseEnvMapIntensities(),
                        renderer
                      );
                    }
                    
                    // CRITICAL: Do NOT re-apply metal state here after updateMaterials
                    // This causes timing issues and "original captured after already modified" bugs
                    // Metal state is handled by initial apply (after model load) and reactive updates (UI changes)
                  }
                }, 0);
              }

              resolve();
            },
            reject
          );
        });
      } else if (newMaterialType) {
        // If only material type changed (no new model), wait for processing
        await new Promise(resolve => setTimeout(resolve, 300));

        // Ensure acrylic emissive base exists in this path as well
        const activeMaterialType = newMaterialType || materialType.activeMaterialType;
        if (meshVisibilityManagerRef.current && activeMaterialType === "ACRYLIC") {
          addAcrylicEmissiveBaseLayers(meshVisibilityManagerRef.current, activeMaterialType);
        }
      }

      // Load/update HDRI - automatically select based on material type if not provided
      // Note: HDRI loading happens in parallel with texture loading for better performance
      if (environmentManagerRef.current) {
        // Convert display type to internal type before HDRI lookup
        const internalType =
          getMaterialTypeInfo(newMaterialType)?.internalType || newMaterialType;
        
        // Use custom HDRI if provided, otherwise auto-select based on material type
        const hdriToLoad = customHdriPath || getHDRIPath(internalType);
        
        // Don't await HDRI loading - let it happen in parallel with texture application
        // This allows the scene to render faster
        environmentManagerRef.current.loadHDRI(
          hdriToLoad,
          (newEnvMap) => {
            // Verify HDRI is actually applied to scene
            const scene = sceneManagerRef.current?.getScene();
            
            const model = modelManagerRef.current?.getModel();
            if (model && materialType.materialModuleRef.current) {
              const activeType = materialType.activeMaterialTypeRef.current;
              const materialModule = materialType.materialModuleRef.current;

              // Defer material updates to allow initial render
              setTimeout(() => {
                // For acrylics: apply matte to artwork, glossy to glass
                if (activeType === "ACRYLIC" && materialModule.applyArtworkMatteGlassGlossy) {
                  materialModule.applyArtworkMatteGlassGlossy(
                    model,
                    newEnvMap,
                    lighting.reflectionIntensity
                  );
                  enforceAcrylicArtworkMatteGlassGlossy(
                    model,
                    newEnvMap,
                    lighting.reflectionIntensity
                  );
                } else {
                  const renderer = sceneManagerRef.current?.getRenderer();
                  
                  // For MIRROR: always call applyMirrorState (single source of truth)
                  // Pass envMap explicitly so mirror materials can reflect the HDRI
                  if (activeType === "MIRROR" && materialModule.applyMirrorState && renderer) {
                    materialModule.applyMirrorState(model, renderer, {
                      reflectionIntensity: lighting.reflectionIntensity,
                      showReflections: lighting.showReflections,
                      baseEnvMapIntensities: materialProcessorRef.current?.getBaseEnvMapIntensities() || new Map(),
                      envMap: newEnvMap, // Explicitly pass the loaded HDRI envMap
                    });
                  } else if (materialModule.updateMaterials && renderer) {
                    materialModule.updateMaterials(
                      model,
                      newEnvMap,
                      lighting.showReflections,
                      lighting.reflectionIntensity,
                      materialProcessorRef.current?.getBaseEnvMapIntensities() || new Map(),
                      renderer
                    );
                  }
                }
              }, 0);
            }
          },
          (error) => {
            if (process.env.NODE_ENV === 'development') {
              console.warn('[HDRI SETUP] HDRI loading failed:', {
                hdriToLoad,
                error,
              });
            }
          }
        );
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.warn("[HDRI SETUP] environmentManagerRef.current is null, cannot load HDRI", {
            newMaterialType,
          });
        }
      }

      // 3. Apply artwork texture - load once and apply to both modes
      // This optimizes by loading the texture only once and reusing it for both fullBleed and shrunk
      if (artworkTexture) {
        const allLayers = textureLayersHook.allTextureLayersRef.current || [];
        const fullBleedLayer = allLayers.find(l => l.meshType === MODE_TYPES.FULL_BLEED);
        const shrunkLayer = allLayers.find(l => l.meshType === MODE_TYPES.SHRUNK);

        if (!fullBleedLayer && !shrunkLayer) {
          throw new Error("No artwork layers found. Make sure model is loaded.");
        }

        // Determine which mode to apply first (use initialMode or default to fullBleed)
        const priorityMode = initialMode || MODE_TYPES.FULL_BLEED;
        
        // Load texture once and apply to priority mode immediately
        // The texture will be cached by TextureManager, so the second call will use the cache
        if (priorityMode === MODE_TYPES.FULL_BLEED && fullBleedLayer) {
          await updateArtwork(artworkTexture, MODE_TYPES.FULL_BLEED);
        } else if (priorityMode === MODE_TYPES.SHRUNK && shrunkLayer) {
          await updateArtwork(artworkTexture, MODE_TYPES.SHRUNK);
        }
        
        // Apply to the other mode - texture is already cached, so this is fast
        // Defer slightly to allow initial render, but no network request needed
        const otherMode = priorityMode === MODE_TYPES.FULL_BLEED ? MODE_TYPES.SHRUNK : MODE_TYPES.FULL_BLEED;
        if (otherMode === MODE_TYPES.FULL_BLEED && fullBleedLayer) {
          // Texture is cached, so this will be fast - just apply to the other mesh
          setTimeout(() => {
            updateArtwork(artworkTexture, MODE_TYPES.FULL_BLEED).catch(err => {
              if (process.env.NODE_ENV === 'development') {
                console.warn('Failed to apply texture to deferred mode:', err);
              }
            });
          }, 50); // Reduced delay since texture is cached
        } else if (otherMode === MODE_TYPES.SHRUNK && shrunkLayer) {
          setTimeout(() => {
            updateArtwork(artworkTexture, MODE_TYPES.SHRUNK).catch(err => {
              if (process.env.NODE_ENV === 'development') {
                console.warn('Failed to apply texture to deferred mode:', err);
              }
            });
          }, 50); // Reduced delay since texture is cached
        }
      }

      // 4. Apply frame texture if provided
      if (frameTexture) {
        await updateFrame(frameTexture);
      }

      // 5. Set initial mode
      if (initialMode) {
        setMode(initialMode);
      }

      return true;
    } catch (error) {
      console.error("Setup error:", error);
      throw error;
    }
  };

  // Update artwork texture (applies to both modes)
  const updateArtworkSimple = async (texturePath) => {
    const allLayers = textureLayersHook.allTextureLayersRef.current || [];
    const fullBleedLayer = allLayers.find(l => l.meshType === MODE_TYPES.FULL_BLEED);
    const shrunkLayer = allLayers.find(l => l.meshType === MODE_TYPES.SHRUNK);

    const promises = [];
    if (fullBleedLayer) {
      promises.push(updateArtwork(texturePath, MODE_TYPES.FULL_BLEED));
    }
    if (shrunkLayer) {
      promises.push(updateArtwork(texturePath, MODE_TYPES.SHRUNK));
    }

    if (promises.length === 0) {
      throw new Error("No artwork layers found");
    }

    await Promise.all(promises);
    return true;
  };

  // Update frame texture
  const updateFrame = async (texturePath) => {
    const allLayers = textureLayersHook.allTextureLayersRef.current || [];
    const frameLayer = allLayers.find(l => {
      const meshName = (l.meshName || "").toLowerCase();
      return meshName.includes("frame_edge") || l.meshType === MODE_TYPES.FRAME;
    });

    if (!frameLayer) {
      throw new Error("Frame_Edge layer not found");
    }

    return new Promise((resolve, reject) => {
      if (!textureManagerRef.current) {
        reject(new Error("TextureManager not initialized"));
        return;
      }

      textureManagerRef.current.loadTexture(
        texturePath,
        (texture) => {
          const mesh = frameLayer.mesh;
          if (!mesh || !mesh.material) {
            reject(new Error("Frame mesh or material not found"));
            return;
          }

          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const mat = mats[frameLayer.materialIndex];
          if (!mat) {
            reject(new Error("Frame material not found"));
            return;
          }

          // Dispose old texture
          const originalTex = textureLayersHook.getOriginalTexture(frameLayer.id);
          if (mat.map && mat.map !== originalTex) {
            mat.map.dispose();
          }

          // Create texture from image
          const clonedTex = textureManagerRef.current
            ? textureManagerRef.current.createTextureFromImage(texture.image, { flipY: false })
            : (() => {
              const tex = new THREE.Texture(texture.image);
              tex.wrapS = THREE.ClampToEdgeWrapping;
              tex.wrapT = THREE.ClampToEdgeWrapping;
              tex.generateMipmaps = false;
              tex.minFilter = THREE.LinearFilter;
              tex.magFilter = THREE.LinearFilter;
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.flipY = false;
              tex.needsUpdate = true;
              return tex;
            })();

          mat.map = clonedTex;
          mat.needsUpdate = true;

          // Animation loop handles rendering automatically - no need for manual render
          resolve(true);
        },
        (err) => {
          reject(err);
        }
      );
    });
  };

  // Expose API methods via ref
  useImperativeHandle(apiRef, () => ({
    // ============================================
    // SIMPLIFIED API (Primary APIs)
    // ============================================
    /**
     * Setup - Initialize everything with artwork, orientation, material type, and optional frame
     * Model path is automatically selected based on orientation and material type
     * 
     * @param {Object} options
     * @param {string} options.artworkTexture - REQUIRED: Path or URL to artwork texture (applied to both fullBleed and shrunk)
     * @param {string} options.orientation - REQUIRED: Orientation type ('portrait' or 'landscape')
     * @param {string} options.materialType - REQUIRED: Material type ('ACRYLIC', 'METAL', 'METAL_BOX', 'WOOD', 'MIRROR')
     * @param {string} options.modelPath - Optional: Custom model path (auto-selected if not provided)
     * @param {string} options.frameTexture - Optional: Path to frame texture (for shrunk mode)
     * @param {string} options.mode - Optional: Initial mode ('fullBleed' or 'shrunk', default: 'fullBleed')
     * @param {string} options.hdriPath - Optional: Custom HDRI path (auto-selected based on material type if not provided)
     * 
     * @example
     * await viewerRef.current.setup({
     *   artworkTexture: '/path/to/artwork.jpg',
     *   orientation: 'portrait',
     *   materialType: 'ACRYLIC'
     * });
     */
    setup,

    /**
     * Set mode - Switch between fullBleed and shrunk
     * @param {string} mode - 'fullBleed' or 'shrunk'
     * 
     * @example
     * viewerRef.current.setMode('shrunk'); // Switch to shrunk mode (shows frame)
     * viewerRef.current.setMode('fullBleed'); // Switch to fullBleed mode (no frame)
     */
    setMode,

    /**
     * Get current mode
     * @returns {string} Current mode ('fullBleed' or 'shrunk')
     */
    getMode: () => currentMode,

    /**
     * Update artwork texture - Applies to both fullBleed and shrunk modes
     * @param {string} texturePath - Path to artwork texture
     */
    updateArtwork: updateArtworkSimple,

    /**
     * Update frame texture - Applies to Frame_Edge mesh (for shrunk mode)
     * @param {string} texturePath - Path or URL to frame texture
     * 
     * @example
     * await viewerRef.current.updateFrame('/path/to/frame.jpg');
     */
    updateFrame,

    /**
     * Set material type
     * @param {string} type - Material type (ACRYLIC, METAL, METAL_BOX, WOOD, MIRROR)
     */
    setMaterialType: (type) => {
      materialType.setSelectedMaterialType(type);
    },

    // ============================================
    // MODE CONTROL (keep for backward compatibility)
    // ============================================
    getCurrentMode: () => currentMode, // Alias for consistency

    // ============================================
    // TEXTURE MANAGEMENT
    // ============================================
    // updateArtwork already defined above in SIMPLIFIED API section
    updateTexture: (identifier, texturePath) => {
      const layer = findTextureLayer(
        textureLayersHook.allTextureLayersRef.current,
        identifier
      );
      if (layer) {
        return updateArtwork(texturePath, layer.meshType);
      }
      return Promise.reject(new Error(`Texture layer not found: ${identifier}`));
    },
    updateTextures, // Batch update
    resetTexture,
    resetArtwork,
    resetAllTextures: () => {
      const layers = textureLayersHook.allTextureLayersRef.current || [];
      layers.forEach((layer) => {
        resetTexture(layer.id);
      });
    },

    // ============================================
    // TEXTURE TRANSFORM
    // ============================================
    transformTexture,
    applyTextureTransformToAllLayers: async (transform, selectionRect = null) => {
      const layers = textureLayersHook.allTextureLayersRef.current || [];
      const promises = layers.map((layer) =>
        transformTexture(layer.id, transform, selectionRect).catch((err) => {
          console.warn(`Failed to transform layer ${layer.id}:`, err);
          return null;
        })
      );
      await Promise.all(promises);
    },
    exportTextureFromCanvas: (canvas, format = "image/png", quality = 1) => {
      return exportTextureFromCanvas(canvas, format, quality);
    },

    // ============================================
    // TEXTURE PROCESSING
    // ============================================
    replaceWhiteWithMetalColor: (image, metalColorType, threshold = 0.9) => {
      if (!textureManagerRef.current) {
        throw new Error("TextureManager not initialized");
      }
      return textureManagerRef.current.replaceWhiteWithMetalColor(image, metalColorType, threshold);
    },
    getTextureLoader: () => textureManagerRef.current?.getLoader() || null,
    loadTexture: (path) => {
      return new Promise((resolve, reject) => {
        if (!textureManagerRef.current) {
          reject(new Error("TextureManager not initialized"));
          return;
        }
        textureManagerRef.current.loadTexture(path, resolve, reject);
      });
    },
    createTextureFromImage: (image, options = {}) => {
      if (!textureManagerRef.current) {
        throw new Error("TextureManager not initialized");
      }
      return textureManagerRef.current.createTextureFromImage(image, options);
    },

    // ============================================
    // MESH CONTROL
    // ============================================
    getMeshes: () => meshVisibilityManagerRef.current?.getMeshes() || [],
    getMeshById: (meshId) => meshVisibilityManagerRef.current?.getMeshById(meshId) || null,
    getMeshesByType: (meshType) => meshVisibilityManagerRef.current?.getMeshesByType(meshType) || [],
    getMeshByName: (meshName) => {
      const meshes = meshVisibilityManagerRef.current?.getMeshes() || [];
      return meshes.find((m) => m.name === meshName) || null;
    },
    setMeshVisibility: (meshId, visible) => {
      const mesh = meshVisibilityManagerRef.current
        ?.getMeshes()
        .find((m) => m.id === meshId);
      if (mesh?.mesh) {
        mesh.mesh.visible = visible;
        mesh.visible = visible;
        // Apply relationships if needed
        if (meshVisibilityManagerRef.current) {
          meshVisibilityManagerRef.current.applyVisibilityRelationships();

          // Update texture layers based on new mesh visibility
          const allLayers = textureLayersHook.allTextureLayersRef.current || [];
          const currentMaterialType = materialType.activeMaterialTypeRef.current;
          const filteredLayers = meshVisibilityManagerRef.current.filterTextureLayersByMeshVisibility(
            allLayers,
            currentMaterialType
          );
          textureLayersHook.setTextureLayers(filteredLayers);
        }
        forceRender();
      }
    },
    toggleMeshVisibility: (meshId) => {
      if (!meshVisibilityManagerRef.current) return;
      const updatedMeshes = meshVisibilityManagerRef.current.toggleMeshVisibility(meshId);
      meshVisibilityHook.setMeshes(updatedMeshes);

      // Update texture layers based on new mesh visibility
      const allLayers = textureLayersHook.allTextureLayersRef.current || [];
      const currentMaterialType = materialType.activeMaterialTypeRef.current;
      const filteredLayers = meshVisibilityManagerRef.current.filterTextureLayersByMeshVisibility(
        allLayers,
        currentMaterialType
      );
      textureLayersHook.setTextureLayers(filteredLayers);

      forceRender();
      return updatedMeshes;
    },
    getMeshVisibility: (meshId) => {
      const mesh = meshVisibilityManagerRef.current?.getMeshById(meshId);
      return mesh ? mesh.visible : null;
    },
    // ============================================
    // GLASS VISIBILITY CONTROL (for acrylics)
    // ============================================
    setGlassVisibility: (visible) => {
      const activeType = materialType.activeMaterialTypeRef.current;
      if (activeType !== "ACRYLIC") {
        if (process.env.NODE_ENV === 'development') {
          console.warn("setGlassVisibility is only available for ACRYLIC material type");
        }
        return false;
      }
      
      const model = modelManagerRef.current?.getModel();
      if (!model) return false;
      
      let found = false;
      model.traverse((obj) => {
        if (!obj.isMesh || !obj.name) return;
        const name = obj.name.toLowerCase();
        const isGlass = name === "glass" || name.includes("glass");
        
        if (isGlass) {
          obj.visible = visible;
          found = true;
        }
      });
      
      // Also update in meshVisibilityManager if glass meshes are tracked
      if (meshVisibilityManagerRef.current) {
        const meshes = meshVisibilityManagerRef.current.getMeshes();
        meshes.forEach(m => {
          if (m.meshType === "glass" && m.mesh) {
            m.mesh.visible = visible;
            m.visible = visible;
          }
        });
      }
      
      if (found) {
        forceRender();
        return true;
      }
      return false;
    },
    getGlassVisibility: () => {
      const activeType = materialType.activeMaterialTypeRef.current;
      if (activeType !== "ACRYLIC") {
        return null;
      }
      
      const model = modelManagerRef.current?.getModel();
      if (!model) return null;
      
      let glassMesh = null;
      model.traverse((obj) => {
        if (!obj.isMesh || !obj.name) return;
        const name = obj.name.toLowerCase();
        const isGlass = name === "glass" || name.includes("glass");
        
        if (isGlass && !glassMesh) {
          glassMesh = obj;
        }
      });
      
      return glassMesh ? glassMesh.visible : null;
    },
    toggleGlassVisibility: () => {
      const activeType = materialType.activeMaterialTypeRef.current;
      if (activeType !== "ACRYLIC") {
        if (process.env.NODE_ENV === 'development') {
          console.warn("toggleGlassVisibility is only available for ACRYLIC material type");
        }
        return false;
      }
      
      const model = modelManagerRef.current?.getModel();
      if (!model) return false;
      
      let glassMesh = null;
      model.traverse((obj) => {
        if (!obj.isMesh || !obj.name) return;
        const name = obj.name.toLowerCase();
        const isGlass = name === "glass" || name.includes("glass");
        
        if (isGlass && !glassMesh) {
          glassMesh = obj;
        }
      });
      
      if (!glassMesh) return false;
      
      const newVisibility = !glassMesh.visible;
      
      // Update all glass meshes
      model.traverse((obj) => {
        if (!obj.isMesh || !obj.name) return;
        const name = obj.name.toLowerCase();
        const isGlass = name === "glass" || name.includes("glass");
        
        if (isGlass) {
          obj.visible = newVisibility;
        }
      });
      
      // Also update in meshVisibilityManager
      if (meshVisibilityManagerRef.current) {
        const meshes = meshVisibilityManagerRef.current.getMeshes();
        meshes.forEach(m => {
          if (m.meshType === "glass" && m.mesh) {
            m.mesh.visible = newVisibility;
            m.visible = newVisibility;
          }
        });
      }
      
      forceRender();
      return true;
    },
    setMeshVisibilityBatch: (updates) => {
      if (!meshVisibilityManagerRef.current) return;
      updates.forEach(({ meshId, visible }) => {
        const mesh = meshVisibilityManagerRef.current
          ?.getMeshes()
          .find((m) => m.id === meshId);
        if (mesh?.mesh) {
          mesh.mesh.visible = visible;
          mesh.visible = visible;
        }
      });
      // Apply relationships after batch update
      meshVisibilityManagerRef.current.applyVisibilityRelationships();

      // Update texture layers based on new mesh visibility
      const allLayers = textureLayersHook.allTextureLayersRef.current || [];
      const currentMaterialType = materialType.activeMaterialTypeRef.current;
      const filteredLayers = meshVisibilityManagerRef.current.filterTextureLayersByMeshVisibility(
        allLayers,
        currentMaterialType
      );
      textureLayersHook.setTextureLayers(filteredLayers);

      forceRender();
    },
    // ============================================
    // MESH VISIBILITY MANAGER (Advanced)
    // ============================================
    classifyMeshType: (meshName) => {
      return meshVisibilityManagerRef.current?.classifyMeshType(meshName) || "other";
    },
    collectMeshes: (object, options = {}) => {
      if (!meshVisibilityManagerRef.current) return [];
      const meshes = meshVisibilityManagerRef.current.collectMeshes(object, options);
      meshVisibilityHook.setMeshes(meshes);
      return meshes;
    },
    applyVisibilityRelationships: () => {
      if (meshVisibilityManagerRef.current) {
        meshVisibilityManagerRef.current.applyVisibilityRelationships();

        // Update texture layers based on new mesh visibility
        const allLayers = textureLayersHook.allTextureLayersRef.current || [];
        const currentMaterialType = materialType.activeMaterialTypeRef.current;
        const filteredLayers = meshVisibilityManagerRef.current.filterTextureLayersByMeshVisibility(
          allLayers,
          currentMaterialType
        );
        textureLayersHook.setTextureLayers(filteredLayers);

        forceRender();
      }
    },
    filterTextureLayersByMeshVisibility: (textureLayers) => {
      if (!meshVisibilityManagerRef.current) return textureLayers || [];
      const currentMaterialType = materialType.activeMaterialType;
      return meshVisibilityManagerRef.current.filterTextureLayersByMeshVisibility(textureLayers || [], currentMaterialType);
    },

    // ============================================
    // TEXTURE LAYER INFO
    // ============================================
    getTextureLayers: () => textureLayersHook.allTextureLayersRef.current || [],
    getTextureLayerById: (layerId) => {
      const layers = textureLayersHook.allTextureLayersRef.current || [];
      return layers.find((l) => l.id === layerId) || null;
    },
    getTextureLayersByType: (meshType) => {
      const layers = textureLayersHook.allTextureLayersRef.current || [];
      return layers.filter((l) => l.meshType === meshType);
    },
    getTextureLayersByMeshName: (meshName) => {
      const layers = textureLayersHook.allTextureLayersRef.current || [];
      return layers.filter((l) => l.meshName === meshName);
    },
    getTextureLayerByMeshId: (meshId) => {
      const layers = textureLayersHook.allTextureLayersRef.current || [];
      const mesh = meshVisibilityManagerRef.current?.getMeshById(meshId);
      if (!mesh) return null;
      return layers.find((l) => l.mesh === mesh.mesh) || null;
    },
    getLayersInfo: () => {
      const layers = textureLayersHook.allTextureLayersRef.current || [];
      const fullBleed = layers.find((l) => l.meshType === MODE_TYPES.FULL_BLEED);
      const shrunk = layers.find((l) => l.meshType === MODE_TYPES.SHRUNK);
      const frame = layers.find((l) => l.meshType === MODE_TYPES.FRAME);

      return {
        fullBleed: fullBleed
          ? { meshName: fullBleed.meshName, hasTexture: !!fullBleed.material?.map }
          : null,
        shrunk: shrunk
          ? { meshName: shrunk.meshName, hasTexture: !!shrunk.material?.map }
          : null,
        frame: frame
          ? { meshName: frame.meshName, hasTexture: !!frame.material?.map }
          : null,
      };
    },

    // ============================================
    // MATERIAL CONTROL
    // ============================================
    // setMaterialType already defined above in SIMPLIFIED API section
    getMaterialType: () => materialType.activeMaterialType,
    getDetectedMaterialType: () => materialType.detectedMaterialType,
    // getMaterialModule defined below in ADVANCED section - using MaterialProcessor version
    setMetalFinish: (finish) => {
      lighting.setMetalFinish(finish);
    },
    getMetalFinish: () => lighting.metalFinish,
    setMetalColor: (color) => {
      materialType.setMetalColor(color);
    },
    getMetalColor: () => materialType.metalColor,
    getMaterialSummary,
    getMaterialProperties: (meshId) => {
      const mesh = meshVisibilityManagerRef.current?.getMeshById(meshId);
      if (!mesh || !mesh.mesh || !mesh.mesh.material) return null;
      const mat = Array.isArray(mesh.mesh.material) ? mesh.mesh.material[0] : mesh.mesh.material;
      return {
        type: mat.type,
        metalness: mat.metalness,
        roughness: mat.roughness,
        transmission: mat.transmission,
        envMapIntensity: mat.envMapIntensity,
        hasMap: !!mat.map,
        hasNormalMap: !!mat.normalMap,
      };
    },
    updateMaterials: () => {
      const model = modelManagerRef.current?.getModel();
      const envMap = environmentManagerRef.current?.getEnvironmentMap();
      if (!model || !materialProcessorRef.current) return;

      const materialModule = materialType.materialModuleRef.current;
      const activeType = materialType.activeMaterialTypeRef.current;
      const renderer = sceneManagerRef.current?.getRenderer();
      
      if (materialModule && renderer) {
        // For MIRROR: always call applyMirrorState (single source of truth)
        // Pass envMap explicitly so mirror materials can reflect the HDRI
        if (activeType === "MIRROR" && materialModule.applyMirrorState) {
          materialModule.applyMirrorState(model, renderer, {
            reflectionIntensity: lighting.reflectionIntensity,
            showReflections: lighting.showReflections,
            baseEnvMapIntensities: materialProcessorRef.current.getBaseEnvMapIntensities(),
            envMap: envMap, // Explicitly pass the HDRI envMap
          });
        } else if (materialModule.updateMaterials && envMap) {
          materialModule.updateMaterials(
            model,
            envMap,
            lighting.showReflections,
            lighting.reflectionIntensity,
            materialProcessorRef.current.getBaseEnvMapIntensities(),
            renderer
          );
        }
        forceRender();
      }
    },

    // ============================================
    // LIGHTING CONTROL
    // ============================================
    updateLighting: (newLighting) => {
      lighting.setLighting(newLighting);
    },
    setReflectionIntensity: (intensity) => {
      lighting.setReflectionIntensity(intensity);
    },
    toggleReflections: () => {
      lighting.setShowReflections(!lighting.showReflections);
    },
    getLighting: () => ({
      ...lighting.lighting,
      reflectionIntensity: lighting.reflectionIntensity,
      showReflections: lighting.showReflections,
    }),

    // ============================================
    // ENVIRONMENT/HDRI CONTROL
    // ============================================
    loadHDRI: (path) => {
      return new Promise((resolve, reject) => {
        if (!environmentManagerRef.current) {
          reject(new Error("EnvironmentManager not initialized"));
          return;
        }
        environmentManagerRef.current.loadHDRI(path, resolve, reject);
      });
    },
    setEnvironmentMap: (envMap) => {
      if (!environmentManagerRef.current) return;
      environmentManagerRef.current.setEnvironmentMap(envMap);
      forceRender();
    },
    getEnvironmentMap: () => environmentManagerRef.current?.getEnvironmentMap() || null,
    setEnvironmentEnabled: (enabled) => {
      if (!environmentManagerRef.current) return;
      environmentManagerRef.current.setEnabled(enabled);
      forceRender();
    },
    isEnvironmentEnabled: () => environmentManagerRef.current?.isEnvironmentEnabled() || false,

    // ============================================
    // CAMERA CONTROL
    // ============================================
    resetCamera: () => {
      const controls = sceneManagerRef.current?.getControls();
      if (controls) {
        controls.reset();
      }
    },
    setCameraPosition: (x, y, z) => {
      const camera = sceneManagerRef.current?.getCamera();
      if (camera) {
        camera.position.set(x, y, z);
        forceRender();
      }
    },
    getCamera: () => sceneManagerRef.current?.getCamera() || null,
    getCameraPosition: () => {
      const camera = sceneManagerRef.current?.getCamera();
      if (camera) {
        return { x: camera.position.x, y: camera.position.y, z: camera.position.z };
      }
      return null;
    },
    setCameraTarget: (x, y, z) => {
      const controls = sceneManagerRef.current?.getControls();
      if (controls) {
        controls.target.set(x, y, z);
        controls.update();
        forceRender();
      }
    },
    getCameraTarget: () => {
      const controls = sceneManagerRef.current?.getControls();
      if (controls) {
        return { x: controls.target.x, y: controls.target.y, z: controls.target.z };
      }
      return null;
    },
    lookAt: (x, y, z) => {
      const camera = sceneManagerRef.current?.getCamera();
      if (camera) {
        camera.lookAt(x, y, z);
        forceRender();
      }
    },
    getCameraFOV: () => {
      const camera = sceneManagerRef.current?.getCamera();
      return camera ? camera.fov : null;
    },
    setCameraFOV: (fov) => {
      const camera = sceneManagerRef.current?.getCamera();
      if (camera) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
        forceRender();
      }
    },

    // ============================================
    // CONTROLS OPERATIONS
    // ============================================
    enableControls: (enabled) => {
      const controls = sceneManagerRef.current?.getControls();
      if (controls) {
        controls.enabled = enabled;
      }
    },
    setControlsEnabled: ({ rotate, pan, zoom }) => {
      const controls = sceneManagerRef.current?.getControls();
      if (controls) {
        if (rotate !== undefined) controls.enableRotate = rotate;
        if (pan !== undefined) controls.enablePan = pan;
        if (zoom !== undefined) controls.enableZoom = zoom;
        controls.update();
      }
    },
    getControlsState: () => {
      const controls = sceneManagerRef.current?.getControls();
      if (!controls) return null;
      return {
        enabled: controls.enabled,
        rotate: controls.enableRotate,
        pan: controls.enablePan,
        zoom: controls.enableZoom,
        target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      };
    },

    // ============================================
    // SCENE CONTROL
    // ============================================
    setBackground: (color) => {
      const scene = sceneManagerRef.current?.getScene();
      if (scene) {
        if (typeof color === "string" || typeof color === "number") {
          scene.background = new THREE.Color(color);
        } else {
          scene.background = color;
        }
        forceRender();
      }
    },
    getBackground: () => {
      const scene = sceneManagerRef.current?.getScene();
      return scene ? scene.background : null;
    },
    setToneMappingExposure: (exposure) => {
      const renderer = sceneManagerRef.current?.getRenderer();
      if (renderer) {
        renderer.toneMappingExposure = exposure;
        forceRender();
      }
    },
    getToneMappingExposure: () => {
      const renderer = sceneManagerRef.current?.getRenderer();
      return renderer ? renderer.toneMappingExposure : null;
    },

    // ============================================
    // MODEL OPERATIONS
    // ============================================
    getModel: () => modelManagerRef.current?.getModel() || null,
    getBoundingBox: () => modelManagerRef.current?.getBoundingBox() || null,
    reloadModel: (path) => {
      return new Promise((resolve, reject) => {
        if (!modelManagerRef.current) {
          reject(new Error("ModelManager not initialized"));
          return;
        }
        const model = modelManagerRef.current.getModel();
        if (model) {
          modelManagerRef.current.removeModel();
        }
        modelManagerRef.current.loadModel(path || modelPath, resolve, reject);
      });
    },
    removeModel: () => {
      if (modelManagerRef.current) {
        modelManagerRef.current.removeModel();
        forceRender();
      }
    },
    getModelInfo: () => {
      const model = modelManagerRef.current?.getModel();
      const bbox = modelManagerRef.current?.getBoundingBox();
      if (!model) return null;

      const size = bbox ? bbox.getSize(new THREE.Vector3()) : null;
      const center = bbox ? bbox.getCenter(new THREE.Vector3()) : null;

      return {
        name: model.name || "Model",
        uuid: model.uuid,
        boundingBox: bbox ? {
          size: size ? { x: size.x, y: size.y, z: size.z } : null,
          center: center ? { x: center.x, y: center.y, z: center.z } : null,
        } : null,
      };
    },

    // ============================================
    // SCENE ACCESS
    // ============================================
    getScene: () => sceneManagerRef.current?.getScene() || null,
    getRenderer: () => sceneManagerRef.current?.getRenderer() || null,
    getControls: () => sceneManagerRef.current?.getControls() || null,

    // ============================================
    // USDZ EXPORT
    // ============================================
    exportUSDZ: async (filename = "model.usdz", options = {}) => {
      const model = modelManagerRef.current?.getModel();
      if (!model) {
        throw new Error("No model loaded");
      }
      return exportModelToUSDZ(model, filename, options);
    },

    // ============================================
    // ANIMATION CONTROL
    // ============================================
    startAnimation: () => {
      sceneManagerRef.current?.startAnimation();
    },
    stopAnimation: () => {
      sceneManagerRef.current?.stopAnimation();
    },
    isAnimating: () => {
      // Access isAnimating property directly from SceneManager instance
      return sceneManagerRef.current?.isAnimating || false;
    },

    // ============================================
    // RENDERER SETTINGS
    // ============================================
    setRendererSize: (width, height) => {
      const renderer = sceneManagerRef.current?.getRenderer();
      const camera = sceneManagerRef.current?.getCamera();
      if (renderer && camera) {
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        forceRender();
      }
    },
    getRendererSize: () => {
      const renderer = sceneManagerRef.current?.getRenderer();
      if (renderer) {
        return { width: renderer.domElement.width, height: renderer.domElement.height };
      }
      return null;
    },
    setPixelRatio: (ratio) => {
      const renderer = sceneManagerRef.current?.getRenderer();
      if (renderer) {
        renderer.setPixelRatio(ratio);
        forceRender();
      }
    },
    getPixelRatio: () => {
      const renderer = sceneManagerRef.current?.getRenderer();
      return renderer ? renderer.getPixelRatio() : null;
    },
    handleResize: () => {
      sceneManagerRef.current?.handleResize();
    },

    // ============================================
    // LIGHTING ADVANCED
    // ============================================
    getLights: () => {
      return lightingManagerRef.current?.getLights() || null;
    },
    resetLightingToDefault: () => {
      if (lightingManagerRef.current) {
        lightingManagerRef.current.resetToDefault();
        // Update lighting hook state
        const defaultLighting = lightingManagerRef.current.getLighting();
        lighting.setLighting(defaultLighting);
        // Set default reflectionIntensity based on current material type
        const activeType = materialType.activeMaterialTypeRef.current || materialType.activeMaterialType;
        if (activeType) {
          const defaultReflectionIntensity = getDefaultReflectionIntensity(activeType);
          lighting.setReflectionIntensity(defaultReflectionIntensity);
        }
      }
    },
    applyMaterialLightingDefaults: (materialType) => {
      if (lightingManagerRef.current) {
        lightingManagerRef.current.applyMaterialDefaults(materialType);
        const newLighting = lightingManagerRef.current.getLighting();
        lighting.setLighting(newLighting);
        // Set default reflectionIntensity based on material type
        const defaultReflectionIntensity = getDefaultReflectionIntensity(materialType);
        lighting.setReflectionIntensity(defaultReflectionIntensity);
      }
    },
    getMaterialLightingDefaults: (materialType) => {
      return lightingManagerRef.current?.getMaterialDefaults(materialType) || null;
    },
    hasMaterialLightingDefaults: (materialType) => {
      return lightingManagerRef.current?.hasMaterialDefaults(materialType) || false;
    },

    // ============================================
    // MATERIAL PROCESSOR
    // ============================================
    getBaseEnvMapIntensities: () => {
      const intensities = materialProcessorRef.current?.getBaseEnvMapIntensities();
      if (!intensities) return null;
      // Convert Map to object for easier use
      const result = {};
      intensities.forEach((value, key) => {
        result[key.uuid || key.toString()] = value;
      });
      return result;
    },
    getMaterialProcessor: () => materialProcessorRef.current || null,
    setMaterialModule: (materialModule) => {
      if (materialProcessorRef.current) {
        materialProcessorRef.current.setMaterialModule(materialModule);
        // Re-process materials if model is loaded
        const model = modelManagerRef.current?.getModel();
        const envMap = environmentManagerRef.current?.getEnvironmentMap();
        if (model && envMap && materialProcessorRef.current) {
          const materialModule = materialType.materialModuleRef.current;
          if (materialModule) {
            const processOptions = {
              materialType: materialType.activeMaterialType,
              metalFinish: lighting.metalFinish,
              metalColor: materialType.metalColor,
              reflectionIntensity: lighting.reflectionIntensity,
              meshVisibilityManager: meshVisibilityManagerRef.current,
            };

            materialProcessorRef.current.processModelMaterials(model, processOptions);
            forceRender();
          }
        }
      }
    },
    getMaterialModule: () => {
      return materialProcessorRef.current?.getMaterialModule() || null;
    },
    updateReflectionIntensity: (intensity) => {
      if (materialProcessorRef.current) {
        materialProcessorRef.current.updateReflectionIntensity(intensity);
        forceRender();
      }
    },

    // ============================================
    // MODEL OPERATIONS (Advanced)
    // ============================================
    centerAndScaleModel: (scaleFactor = 2.5) => {
      if (modelManagerRef.current) {
        const model = modelManagerRef.current.getModel();
        if (model) {
          modelManagerRef.current.centerAndScaleModel(model, scaleFactor);
          forceRender();
        }
      }
    },
    updateCameraAndControls: (cameraPosition) => {
      if (modelManagerRef.current) {
        const pos = cameraPosition
          ? new THREE.Vector3(cameraPosition.x, cameraPosition.y, cameraPosition.z)
          : undefined;
        modelManagerRef.current.updateCameraAndControls(pos);
        forceRender();
      }
    },

    // ============================================
    // TEXTURE CACHE
    // ============================================
    clearTextureCache: () => {
      textureManagerRef.current?.clearCache();
    },

    // ============================================
    // UTILITY
    // ============================================
    forceRender,

    // ============================================
    // STATE
    // ============================================
    isLoading: () => loading,
    getError: () => error,
  }));

  // Apply mode when prop changes
  useEffect(() => {
    if (modeProp && modeProp !== currentMode) {
      setMode(modeProp);
    }
  }, [modeProp]);

  return {
    loading,
    error,
    currentMode,
    sceneManagerRef,
    modelManagerRef,
    textureManagerRef,
    meshVisibilityManagerRef,
  };
}
