import { useEffect, useRef, useState, useImperativeHandle } from "react";
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
import {
  useMaterialType,
  useTextureLayers,
  useMeshVisibility,
  useLighting,
  useMaterialUpdates,
} from "../hooks/index.jsx";
import { useTextureOperations } from "../hooks/useTextureOperations.jsx";
import { SCENE_CONFIG, MATERIAL_CONFIG } from "../config/appConfig.jsx";
import { findArtworkTextureLayer, findTextureLayer, getTextureLayersForMode } from "../utils/textureUtils.jsx";
import { getArtworkMeshForMode, MODE_TYPES } from "../utils/meshUtils.jsx";
import { exportModelToUSDZ } from "../utils/usdzUtils.jsx";
import { applyTextureTransform, exportTextureFromCanvas } from "../utils/textureTransformUtils.jsx";

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

  // Hooks
  const materialType = useMaterialType();
  const textureLayersHook = useTextureLayers();
  const meshVisibilityHook = useMeshVisibility();
  const lighting = useLighting(lightingManagerRef);


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

    // Load HDRI
    if (hdriPath) {
      environmentManager.loadHDRI(
        hdriPath,
        (newEnvMap) => {
          const model = modelManager.getModel();
          if (model && materialType.materialModuleRef.current?.updateMaterials) {
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
        (err) => {
          setError(err);
          if (onError) onError(err);
        }
      );
    }

    // Load model
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
        }

        // Load model
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

            // Collect meshes
            const meshList = meshVisibilityManager.collectMeshes(model);
            
            // Apply visibility relationships for all materials (including metals)
            // Metals follow the same rules: fullBleed ON → shrunk/frame OFF, shrunk ON → frame ON, fullBleed OFF
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

            // Store texture layers
            textureLayersHook.storeOriginalTextures(layers);
            textureLayersHook.setAllTextureLayers(layers);

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
              filteredLayers = meshVisibilityManager.filterTextureLayersByMeshVisibility(
                layers,
                activeMaterialType
              );

              // Apply custom filter if provided
              if (textureLayerFilter && typeof textureLayerFilter === 'function') {
                filteredLayers = filteredLayers.filter(textureLayerFilter);
              } else if (filterBackTextures) {
                // Default: filter out back texture layers
                filteredLayers = filteredLayers.filter((layer) => {
                  const meshName = (layer.meshName || "").toLowerCase();
                  const backKeywords = ["back", "rear", "behind"];
                  return !backKeywords.some(keyword => meshName.includes(keyword));
                });
              }
            }

            textureLayersHook.setTextureLayers(filteredLayers);

            // Apply initial mode
            if (modeProp) {
              setMode(modeProp);
            }

            // Update materials with environment map (skip for acrylics - render as-is)
            const envMap = environmentManager.getEnvironmentMap();
            if (envMap && materialModule.updateMaterials && activeMaterialType !== "ACRYLIC") {
              materialModule.updateMaterials(
                model,
                envMap,
                lighting.showReflections,
                lighting.reflectionIntensity,
                materialProcessor.getBaseEnvMapIntensities()
              );
            }

            setLoading(false);

            // Call onReady with API
            if (onReady && apiRef.current) {
              onReady(apiRef.current);
            }
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
  }, [modelPath, hdriPath]); // Only re-run if paths change

  // Material updates
  useMaterialUpdates({
    modelManagerRef,
    sceneManagerRef,
    environmentManagerRef,
    materialProcessorRef,
    materialType,
    lighting,
  });

  // Texture operations
  const textureOperations = useTextureOperations({
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

    setCurrentMode(newMode);
    if (onModeChange) onModeChange(newMode);
  };

  // Update artwork texture
  const updateArtwork = async (texturePath, mode = null) => {
    const targetMode = mode || currentMode;
    const allLayers = textureLayersHook.allTextureLayersRef.current || [];
    
    console.log('updateArtwork called:', {
      targetMode,
      totalLayers: allLayers.length,
      availableMeshTypes: allLayers.map(l => ({ name: l.meshName, type: l.meshType }))
    });
    
    const layer = findArtworkTextureLayer(allLayers, targetMode);

    if (!layer) {
      console.warn(`No artwork layer found for mode: ${targetMode}. Available layers:`, allLayers.map(l => ({ name: l.meshName, type: l.meshType })));
      return false;
    }
    
    console.log('Found layer for texture application:', {
      meshName: layer.meshName,
      meshType: layer.meshType,
      layerId: layer.id
    });

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
            if (isFrame) {
              console.log('Applying texture to frame mesh:', layer.meshName);
            } else if (isFullBleed || isShrunk) {
              console.log('Applying texture to artwork mesh (metal):', layer.meshName, 'Mesh type:', layer.meshType);
            } else {
              // Skip other mesh types for metals
              console.log(`Skipping texture application - only Artwork_FullBleed, Artwork_Shrunk, and frames allowed for metals. Mesh type: ${layer.meshType}, Mesh name: ${layer.meshName}`);
                  resolve(false);
                  return;
            }
            
            // For metals: just apply the texture directly, no processing (PNGs now, no white removal)
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

            // For metals: Copy brushed metal finish from corresponding metal background mesh
            if (isMetal && (isFullBleed || isShrunk)) {
              // Find the corresponding metal background mesh (Metal_Silver_FullBleed/Shrunk or Metal_White_FullBleed/Shrunk)
              let metalMatForColor = null; // Always from FullBleed for color consistency
              let metalMatForMaps = null;  // From corresponding mesh (fullBleed or shrunk)
              const scene = sceneManagerRef.current?.getScene();
              const meshNameLower = (layer.meshName || "").toLowerCase();
              const activeType = materialType.activeMaterialTypeRef.current;
              
              // First, detect metal type from scene meshes (more reliable than materialType)
              let detectedMetalType = null;
              if (scene) {
                scene.traverse((obj) => {
                  if (obj.isMesh && obj.name) {
                    const objNameLower = obj.name.toLowerCase();
                    if (objNameLower.includes("silver") && (objNameLower.includes("fullbleed") || objNameLower.includes("shrunk"))) {
                      detectedMetalType = "silver";
                    } else if (objNameLower.includes("white") && objNameLower.includes("metal") && (objNameLower.includes("fullbleed") || objNameLower.includes("shrunk"))) {
                      detectedMetalType = "white";
                    }
                  }
                });
              }
              
              // Use detected type from scene if available, otherwise fall back to activeType
              const isSilver = detectedMetalType === "silver" || (detectedMetalType === null && (activeType === "METAL" || meshNameLower.includes("silver")));
              const isWhite = detectedMetalType === "white" || (detectedMetalType === null && (activeType === "METAL_BOX" || meshNameLower.includes("white")));
              
              console.log(`[Metal PBR] MaterialType: ${activeType}, DetectedMetalType: ${detectedMetalType}, isSilver: ${isSilver}, isWhite: ${isWhite}, meshName: ${layer.meshName}`);
              
              if (scene) {
                scene.traverse((obj) => {
                  if (obj.isMesh && obj.material) {
                    const objNameLower = (obj.name || "").toLowerCase();
                    
                    // Always find FullBleed for color (ensures consistency)
                    if (!metalMatForColor) {
                      let shouldMatchFullBleed = false;
                      if (isSilver) {
                        shouldMatchFullBleed = objNameLower.includes("silver") && 
                                               (objNameLower.includes("fullbleed") || objNameLower.includes("full_bleed")) &&
                                               !objNameLower.includes("artwork");
                      } else if (isWhite) {
                        // Match Metal_White_FullBleed - simplified like silver (just check for "white")
                        shouldMatchFullBleed = objNameLower.includes("white") && 
                                               (objNameLower.includes("fullbleed") || objNameLower.includes("full_bleed")) &&
                                               !objNameLower.includes("artwork");
                      }
                      
                      if (shouldMatchFullBleed) {
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        mats.forEach((m) => {
                          if (m.metalness !== undefined && m.metalness > 0.4) {
                            metalMatForColor = m;
                            console.log(`[Metal PBR] Found FullBleed material for color: ${obj.name}, metalness: ${m.metalness}`);
                          }
                        });
                      }
                    }
                    
                    // Find corresponding mesh for PBR maps (fullBleed or shrunk)
                    if (!metalMatForMaps) {
                      let shouldMatch = false;
                if (isFullBleed) {
                        if (isSilver) {
                          shouldMatch = objNameLower.includes("silver") && 
                                       (objNameLower.includes("fullbleed") || objNameLower.includes("full_bleed")) &&
                                       !objNameLower.includes("artwork");
                        } else if (isWhite) {
                          // Match Metal_White_FullBleed - simplified like silver (just check for "white")
                          shouldMatch = objNameLower.includes("white") && 
                                       (objNameLower.includes("fullbleed") || objNameLower.includes("full_bleed")) &&
                                       !objNameLower.includes("artwork");
                  }
                } else if (isShrunk) {
                        if (isSilver) {
                          shouldMatch = objNameLower.includes("silver") && 
                                       (objNameLower.includes("shrunk") || objNameLower.includes("shrink")) &&
                                       !objNameLower.includes("artwork");
                        } else if (isWhite) {
                          // Match Metal_White_Shrunk - simplified like silver (just check for "white")
                          shouldMatch = objNameLower.includes("white") && 
                                       (objNameLower.includes("shrunk") || objNameLower.includes("shrink")) &&
                                       !objNameLower.includes("artwork");
                        }
                      }
                      
                      if (shouldMatch) {
                        console.log(`[Metal PBR] Found matching mesh: ${obj.name}`);
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        mats.forEach((m) => {
                          if (m.metalness !== undefined && m.metalness > 0.4) {
                            metalMatForMaps = m;
                            console.log(`[Metal PBR] Selected material for PBR maps: ${obj.name}, metalness: ${m.metalness}`);
                          }
                        });
                      }
                      }
                    }
                  });
              }
              
              // Copy brushed metal finish if found
              if (metalMatForMaps || metalMatForColor) {
                // Copy PBR maps from corresponding mesh (fullBleed or shrunk)
                if (metalMatForMaps) {
                  if (metalMatForMaps.normalMap) {
                    mat.normalMap = metalMatForMaps.normalMap;
                    if (mat.normalScale && metalMatForMaps.normalScale) {
                      mat.normalScale.copy(metalMatForMaps.normalScale);
                    }
                  }
                  if (metalMatForMaps.roughnessMap) {
                    mat.roughnessMap = metalMatForMaps.roughnessMap;
                  }
                  if (metalMatForMaps.metalnessMap) {
                    mat.metalnessMap = metalMatForMaps.metalnessMap;
                  }
                  if (metalMatForMaps.aoMap) {
                    mat.aoMap = metalMatForMaps.aoMap;
                    if (metalMatForMaps.aoMapIntensity !== undefined) {
                      mat.aoMapIntensity = metalMatForMaps.aoMapIntensity;
                    }
                  }
                  if (metalMatForMaps.emissiveMap) {
                    mat.emissiveMap = metalMatForMaps.emissiveMap;
                  }
                  
                  // Set material properties for metallic brushed finish
                  mat.metalness = 1.0; // Make it metallic
                  mat.roughness = metalMatForMaps.roughness !== undefined ? metalMatForMaps.roughness : 0.75; // Use frame's roughness (brushed: 0.75)
                  
                  // Copy environment map and intensity for reflections
                  if (metalMatForMaps.envMap) {
                    mat.envMap = metalMatForMaps.envMap;
                  }
                  if (metalMatForMaps.envMapIntensity !== undefined) {
                    mat.envMapIntensity = metalMatForMaps.envMapIntensity;
                  }
                }
                
                // ALWAYS copy color from FullBleed mesh (ensures consistency between fullBleed and shrunk)
                if (metalMatForColor && metalMatForColor.color) {
                  mat.color.copy(metalMatForColor.color);
                } else if (metalMatForMaps && metalMatForMaps.color) {
                  // Fallback: use color from corresponding mesh if FullBleed not found
                  mat.color.copy(metalMatForMaps.color);
                }
              } else {
                // Fallback: Set metal properties even if frame material not found
                mat.metalness = 1.0;
                mat.roughness = 0.75; // Default to brushed finish
              }
              
              // Apply minimal transparency settings (matching working test app)
            mat.transparent = true;
            mat.opacity = 1.0;
              mat.alphaTest = 0.001; // Very small alpha test (matches working app)
              mat.depthWrite = true; // Proper depth rendering (matches working app)
              // Don't set side property - let material use its original setting
            }

            mat.needsUpdate = true;
          } else if (isMirror) {
            // Allow Artwork_FullBleed, Artwork_Shrunk, and frames
            if (isFrame) {
              console.log('Applying texture to frame mesh:', layer.meshName);
            } else if (isFullBleed || isShrunk) {
              console.log('Applying texture to artwork mesh (mirror):', layer.meshName, 'Mesh type:', layer.meshType);
            } else {
              // Skip other mesh types for mirrors
              console.log(`Skipping texture application - only Artwork_FullBleed, Artwork_Shrunk, and frames allowed for mirrors. Mesh type: ${layer.meshType}, Mesh name: ${layer.meshName}`);
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

            // For mirrors: Set artwork layer to matte with minimal reflection (don't copy mirror's reflective properties)
            if (isFullBleed || isShrunk) {
              // Store original material properties BEFORE modifying them (for reset functionality)
              if (!textureLayersHook.getOriginalMaterialProperties(layerId)) {
                textureLayersHook.storeOriginalMaterialProperties(layerId, mat);
              }
              
              // Remove any reflection-related maps
              mat.normalMap = null;
              mat.roughnessMap = null;
              mat.metalnessMap = null;
              mat.clearcoatMap = null;
              mat.clearcoatNormalMap = null;
              mat.clearcoatRoughnessMap = null;
              mat.sheenColorMap = null;
              mat.sheenRoughnessMap = null;
              
              // Set matte properties: high roughness (matte), low metalness, minimal reflection
              mat.roughness = 0.95; // Very matte (high roughness = less reflective)
              mat.metalness = 0.0; // Non-metallic
              mat.envMapIntensity = 0.1; // Very low environment map intensity (minimal reflection)
              
              // Keep useful maps if they exist (AO, emissive, etc.)
              // But remove reflection-related ones
              
              console.log(`Set matte properties for mirror artwork layer: "${layer.meshName}" (roughness: ${mat.roughness}, envMapIntensity: ${mat.envMapIntensity})`);
            }
            
            // Enable transparency for PNG textures (alpha channel support)
            mat.transparent = true;
            mat.opacity = 1.0;
            mat.alphaTest = 0.01; // Small alpha test to help with transparency
            mat.side = THREE.DoubleSide;
            mat.depthWrite = false; // Important for transparency rendering

            mat.needsUpdate = true;
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
            
            // For acrylic: Composite white base with artwork texture
            let processedImage = texture.image;
            
            if (isAcrylic && (isFullBleed || isShrunk)) {
              // Create a composite texture with white base and artwork on top
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              // Get image dimensions
              const img = texture.image;
              const width = img.width || img.naturalWidth || 2048;
              const height = img.height || img.naturalHeight || 2048;
              
              canvas.width = width;
              canvas.height = height;
              
              // Draw white background first
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, width, height);
              
              // Draw artwork texture on top (preserving alpha)
              ctx.drawImage(img, 0, 0, width, height);
              
              processedImage = canvas;
            }
            
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

          // Force render
          const scene = sceneManagerRef.current?.getScene();
          const camera = sceneManagerRef.current?.getCamera();
          const renderer = sceneManagerRef.current?.getRenderer();
          if (renderer && scene && camera) {
            renderer.render(scene, camera);
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
      const restored = textureLayersHook.restoreOriginalMaterialProperties(layer.id, mat);
      if (restored) {
        console.log(`Restored original material properties for mirror artwork layer: "${layer.meshName}"`);
      }
    }
    
    mat.needsUpdate = true;

    // Force render
    const scene = sceneManagerRef.current?.getScene();
    const camera = sceneManagerRef.current?.getCamera();
    const renderer = sceneManagerRef.current?.getRenderer();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }

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
        console.warn(`Failed to update texture ${identifier}:`, err);
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

    // Force render
    const scene = sceneManagerRef.current?.getScene();
    const camera = sceneManagerRef.current?.getCamera();
    const renderer = sceneManagerRef.current?.getRenderer();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }

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
  const forceRender = () => {
    const scene = sceneManagerRef.current?.getScene();
    const camera = sceneManagerRef.current?.getCamera();
    const renderer = sceneManagerRef.current?.getRenderer();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  };

  // ============================================
  // SIMPLIFIED API FUNCTIONS
  // ============================================
  
  // Setup function - initialize everything
  const setup = async (options = {}) => {
    const {
      modelPath: newModelPath,
      artworkTexture,
      materialType: newMaterialType,
      frameTexture,
      mode: initialMode = MODE_TYPES.FULL_BLEED,
    } = options;

    try {
      // 1. Set material type first (before model load if needed)
      if (newMaterialType) {
        materialType.setSelectedMaterialType(newMaterialType);
      }

      // 2. Load/reload model if new path provided
      if (newModelPath) {
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
        }

        // Load the new model and process materials
        await new Promise((resolve, reject) => {
          modelManagerRef.current.loadModel(
            newModelPath,
            (loadedModel, boundingBox) => {
              if (!materialProcessorRef.current) {
                reject(new Error("MaterialProcessor not initialized"));
                return;
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

              // Update materials with environment map
              const envMap = environmentManagerRef.current?.getEnvironmentMap();
              if (envMap && materialModule.updateMaterials && activeMaterialType !== "ACRYLIC") {
                materialModule.updateMaterials(
                  loadedModel,
                  envMap,
                  lighting.showReflections,
                  lighting.reflectionIntensity,
                  materialProcessorRef.current.getBaseEnvMapIntensities()
                );
              }

              resolve();
            },
            reject
          );
        });
      } else if (newMaterialType) {
        // If only material type changed, wait for processing
        await new Promise(resolve => setTimeout(resolve, 300));
      } else {
        // Just wait for any pending operations
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 3. Apply artwork texture to both fullBleed and shrunk modes
      if (artworkTexture) {
        const allLayers = textureLayersHook.allTextureLayersRef.current || [];
        const fullBleedLayer = allLayers.find(l => l.meshType === MODE_TYPES.FULL_BLEED);
        const shrunkLayer = allLayers.find(l => l.meshType === MODE_TYPES.SHRUNK);

        if (!fullBleedLayer && !shrunkLayer) {
          throw new Error("No artwork layers found. Make sure model is loaded.");
        }

        // Apply to both modes simultaneously
        const promises = [];
        if (fullBleedLayer) {
          promises.push(updateArtwork(artworkTexture, MODE_TYPES.FULL_BLEED));
        }
        if (shrunkLayer) {
          promises.push(updateArtwork(artworkTexture, MODE_TYPES.SHRUNK));
        }
        await Promise.all(promises);
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

          // Force render
          const scene = sceneManagerRef.current?.getScene();
          const camera = sceneManagerRef.current?.getCamera();
          const renderer = sceneManagerRef.current?.getRenderer();
          if (renderer && scene && camera) {
            renderer.render(scene, camera);
          }

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
     * Setup - Initialize everything with model, textures, and material type
     * @param {Object} options
     * @param {string} options.modelPath - Path to GLB model file
     * @param {string} options.artworkTexture - Path to artwork texture (applied to both fullBleed and shrunk)
     * @param {string} options.materialType - Material type (ACRYLIC, METAL, METAL_BOX, WOOD, MIRROR)
     * @param {string} options.frameTexture - Optional: Path to frame texture (for shrunk mode)
     * @param {string} options.mode - Optional: Initial mode ('fullBleed' or 'shrunk', default: 'fullBleed')
     */
    setup,
    
    /**
     * Set mode - Switch between fullBleed and shrunk
     * @param {string} mode - 'fullBleed' or 'shrunk'
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
     * @param {string} texturePath - Path to frame texture
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
    updateArtwork,
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
    setMaterialType: (type) => {
      materialType.setSelectedMaterialType(type);
    },
    getMaterialType: () => materialType.activeMaterialType,
    getDetectedMaterialType: () => materialType.detectedMaterialType,
    getMaterialModule: () => materialType.materialModuleRef.current || null,
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
      if (!model || !envMap || !materialProcessorRef.current) return;
      
      const materialModule = materialType.materialModuleRef.current;
      if (materialModule && materialModule.updateMaterials) {
        const activeType = materialType.activeMaterialTypeRef.current;
        materialModule.updateMaterials(
          model,
          envMap,
          lighting.showReflections,
          lighting.reflectionIntensity,
          materialProcessorRef.current.getBaseEnvMapIntensities()
        );
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
      }
    },
    applyMaterialLightingDefaults: (materialType) => {
      if (lightingManagerRef.current) {
        lightingManagerRef.current.applyMaterialDefaults(materialType);
        const newLighting = lightingManagerRef.current.getLighting();
        lighting.setLighting(newLighting);
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
