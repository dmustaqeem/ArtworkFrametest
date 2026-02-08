import { useRef, useState } from "react";
import USDZExporterButton from "../components/USDZExporter.jsx";
import TextureLayerManager from "../components/TextureLayerManager.jsx";
import TextureTransformModal from "../components/TextureTransformModal.jsx";
import {
  MODEL_PATHS,
  MATERIAL_CONFIG,
  SCENE_CONFIG,
  UI_CONFIG,
  USDZ_CONFIG,
} from "../config/appConfig.jsx";
import {
  useMaterialType,
  useTextureLayers,
  useMeshVisibility,
  useLighting,
  useAppInitialization,
  useTextureOperations,
  useMaterialUpdates,
} from "../hooks/index.jsx";
import {
  ControlsPanel,
  CollapsibleSection,
  LightingControls,
  MeshVisibilityControls,
  MaterialInfoPanel,
  ControlButton,
} from "../components/index.jsx";
import MaterialModelPanel from "../components/MaterialModelPanel.jsx";

export default function GlbTextureSwapTester() {
  const mountRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [materialSummary, setMaterialSummary] = useState(null);
  const [showTextureTransformModal, setShowTextureTransformModal] = useState(false);
  const [selectedModelPath, setSelectedModelPath] = useState(MODEL_PATHS.GLB);
  const isLoadingRef = useRef(false); // Track loading state to prevent race conditions

  // Use custom hooks for state management
  const materialType = useMaterialType();
  const textureLayersHook = useTextureLayers();
  const meshVisibilityHook = useMeshVisibility();

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

  // Lighting hook (needs lightingManagerRef - will be set in useEffect)
  const lighting = useLighting(lightingManagerRef);

  // Use initialization hook
  useAppInitialization({
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
  });

  // Use texture operations hook
  const textureOperations = useTextureOperations({
    textureLayersHook,
    materialType,
    textureManagerRef,
    sceneManagerRef,
    testTexture1Ref,
    testTexture2Ref,
  });

  // Use material updates hook
  useMaterialUpdates({
    modelManagerRef,
    sceneManagerRef,
    environmentManagerRef,
    materialProcessorRef,
    materialType,
    lighting,
    isLoadingRef, // Pass loading ref to prevent updates during model loading
  });

  // =========================
  // MESH VISIBILITY FUNCTIONS
  // =========================

  // Filter texture layers based on mesh visibility relationships
  const filterTextureLayersByMeshVisibility = (allLayers) => {
    if (!meshVisibilityManagerRef.current) return;
    const filteredLayers = meshVisibilityHook.filterTextureLayersByMeshVisibility(
      allLayers,
      meshVisibilityManagerRef.current
    );
    textureLayersHook.setTextureLayers(filteredLayers);
  };

  const toggleMeshVisibility = (meshId) => {
    const updatedMeshes = meshVisibilityHook.toggleMeshVisibility(meshId, meshVisibilityManagerRef.current);
    
    // Update texture layers based on new mesh visibility
    filterTextureLayersByMeshVisibility(textureLayersHook.allTextureLayersRef.current);
  };

  // =========================
  // MODEL RELOAD FUNCTION
  // =========================
  const reloadModel = async (modelPath, materialTypeValue) => {
    if (!modelManagerRef.current || !sceneManagerRef.current) {
      setError("Managers not initialized");
      return;
    }

    // Prevent multiple simultaneous loads
    if (isLoadingRef.current) {
      console.log("[GlbTextureSwapTester] Model load already in progress, skipping...");
      return;
    }

    isLoadingRef.current = true;
    setLoading(true);
    setError("");

    try {
      // Remove old model
      const oldModel = modelManagerRef.current.getModel();
      if (oldModel) {
        modelManagerRef.current.removeModel();
      }

      // Clear old data
      meshVisibilityManagerRef.current?.clear();
      textureLayersHook.setAllTextureLayers([]);
      textureLayersHook.setTextureLayers([]);
      meshVisibilityHook.setMeshes([]);

      // Load new model
      modelManagerRef.current.loadModel(
        modelPath,
        (model, boundingBox) => {
          if (!materialProcessorRef.current) {
            setError("MaterialProcessor not initialized");
            setLoading(false);
            return;
          }

          // Collect meshes
          const meshList = meshVisibilityManagerRef.current.collectMeshes(model);
          meshVisibilityManagerRef.current.applyVisibilityRelationships();
          meshVisibilityHook.setMeshes(meshList);

          // Update material module if material type changed
          const activeMaterialType = materialTypeValue || materialType.activeMaterialType;
          if (materialTypeValue) {
            materialType.setSelectedMaterialType(materialTypeValue);
          }
          
          const newMaterialModule = materialType.getActiveMaterialModule();
          if (newMaterialModule && materialProcessorRef.current) {
            materialType.materialModuleRef.current = newMaterialModule;
            materialProcessorRef.current.setMaterialModule(newMaterialModule);
          }

          // Process materials
          // Determine metal color from model path if it's a metal model
          let metalColor = materialType.metalColor;
          if (activeMaterialType === "METAL" || activeMaterialType === "METAL_BOX") {
            const modelPathLower = modelPath?.toLowerCase() || "";
            if (modelPathLower.includes("white")) {
              metalColor = "white";
              materialType.setMetalColor("white");
            } else if (modelPathLower.includes("silver")) {
              metalColor = "brushed_silver";
              materialType.setMetalColor("brushed_silver");
            }
          }
          
          const processOptions = {
            materialType: activeMaterialType,
            metalFinish: lighting.metalFinish,
            metalColor: metalColor,
            reflectionIntensity: lighting.reflectionIntensity,
            meshVisibilityManager: meshVisibilityManagerRef.current,
          };
          
          const { materialDetails, textureLayers: layers } = materialProcessorRef.current.processModelMaterials(
            model,
            processOptions
          );

          // Store texture layers
          textureLayersHook.storeOriginalTextures(layers);
          textureLayersHook.setAllTextureLayers(layers);

          // Filter texture layers
          const isMetal = activeMaterialType === "METAL" || activeMaterialType === "METAL_BOX";
          const isMirror = activeMaterialType === "MIRROR";
          const isAcrylic = activeMaterialType === "ACRYLIC";
          
          let filteredLayers;
          if (isMetal || isMirror || isAcrylic) {
            filteredLayers = layers;
          } else {
            filteredLayers = meshVisibilityHook.filterTextureLayersByMeshVisibility(
              layers,
              meshVisibilityManagerRef.current,
              activeMaterialType
            );
          }
          textureLayersHook.setTextureLayers(filteredLayers);

          // Update material summary
          const byType = {};
          let totalMeshes = meshList.length;
          let totalMaterials = 0;
          materialDetails.forEach((detail) => {
            byType[detail.materialType] = (byType[detail.materialType] || 0) + 1;
            totalMaterials++;
          });
          setMaterialSummary({ totalMeshes, totalMaterials, byType });

          // Update materials with environment map
          const envMap = environmentManagerRef.current?.getEnvironmentMap();
          const currentMaterialModule = materialType.materialModuleRef.current;
          if (envMap && currentMaterialModule?.updateMaterials) {
            currentMaterialModule.updateMaterials(
              model,
              envMap,
              lighting.showReflections,
              lighting.reflectionIntensity,
              materialProcessorRef.current.getBaseEnvMapIntensities()
            );
          }

          isLoadingRef.current = false;
          setLoading(false);
        },
        (errorMsg) => {
          isLoadingRef.current = false;
          setError(errorMsg);
          setLoading(false);
        }
      );
    } catch (err) {
      isLoadingRef.current = false;
      setError(err.message || "Failed to reload model");
      setLoading(false);
    }
  };

  // Handle material type change (only called when NOT reloading model)
  const handleMaterialTypeChange = (internalType, displayType) => {
    // Skip if model is currently loading
    if (isLoadingRef.current || loading) {
      console.log("[GlbTextureSwapTester] Skipping material type change - model loading in progress");
      return;
    }
    
    // Set metal color based on display type
    if (displayType === "METAL_SILVER") {
      materialType.setMetalColor("brushed_silver");
    } else if (displayType === "METAL_WHITE") {
      materialType.setMetalColor("white");
    }
    
    materialType.setSelectedMaterialType(internalType);
    
    // Update material module and processor
    const materialModule = materialType.getActiveMaterialModule();
    if (materialModule && materialProcessorRef.current) {
      materialType.materialModuleRef.current = materialModule;
      materialProcessorRef.current.setMaterialModule(materialModule);
      
      // Re-apply materials to existing model if loaded (and not currently loading)
      const model = modelManagerRef.current?.getModel();
      if (model && materialProcessorRef.current) {
        const metalColor = displayType === "METAL_SILVER" ? "brushed_silver" : 
                          displayType === "METAL_WHITE" ? "white" : materialType.metalColor;
        
        // Use requestAnimationFrame to batch updates and prevent glitches
        requestAnimationFrame(() => {
          // Double-check model still exists and we're not loading
          if (isLoadingRef.current || !modelManagerRef.current?.getModel()) {
            return;
          }
          
          materialProcessorRef.current.updateMaterialsForType(model, {
            materialType: internalType,
            metalFinish: lighting.metalFinish,
            metalColor: metalColor,
            reflectionIntensity: lighting.reflectionIntensity,
          });
          
          // Update environment map
          const envMap = environmentManagerRef.current?.getEnvironmentMap();
          if (envMap && materialModule.updateMaterials) {
            materialModule.updateMaterials(
              model,
              envMap,
              lighting.showReflections,
              lighting.reflectionIntensity,
              materialProcessorRef.current.getBaseEnvMapIntensities()
            );
          }
          
          // Force render update
          const renderer = sceneManagerRef.current?.getRenderer();
          const scene = sceneManagerRef.current?.getScene();
          const camera = sceneManagerRef.current?.getCamera();
          if (renderer && scene && camera) {
            renderer.render(scene, camera);
          }
        });
      }
    }
  };

  // Handle model selection
  const handleModelSelect = (modelPath, internalType, displayType) => {
    setSelectedModelPath(modelPath);
    
    // Set metal color based on display type before reloading
    if (displayType === "METAL_SILVER") {
      materialType.setMetalColor("brushed_silver");
    } else if (displayType === "METAL_WHITE") {
      materialType.setMetalColor("white");
    }
    
    reloadModel(modelPath, internalType);
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        background: UI_CONFIG.background.gradient,
      }}
    >
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* Material & Model Selector Panel - Separate from controls */}
      <MaterialModelPanel
        activeMaterialType={materialType.activeMaterialType}
        selectedModelPath={selectedModelPath}
        metalColor={materialType.metalColor}
        onMaterialTypeChange={(internalType, displayType) => {
          handleMaterialTypeChange(internalType, displayType);
        }}
        onModelSelect={(modelPath, internalType, displayType) => {
          handleModelSelect(modelPath, internalType, displayType);
        }}
      />

      {/* Controls Panel */}
      <ControlsPanel>
        <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>
          Controls
        </div>

        {loading && <div style={{ color: "#7CFC00", marginBottom: 12 }}>Loading…</div>}
        {error && <div style={{ color: "#ff6b6b", marginBottom: 12 }}>ERROR: {error}</div>}

        <button
          onClick={() => lighting.setShowReflections(!lighting.showReflections)}
          style={{
            width: "100%",
            padding: 14,
            border: 0,
            borderRadius: 6,
            background: lighting.showReflections ? "#4CAF50" : "#666",
            color: "white",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 14,
            marginTop: 12,
            transition: "background-color 0.2s",
            boxShadow: lighting.showReflections ? "0 0 10px rgba(76, 175, 80, 0.5)" : "none",
          }}
          onMouseEnter={(e) => {
            e.target.style.background = lighting.showReflections ? "#45a049" : "#777";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = lighting.showReflections ? "#4CAF50" : "#666";
          }}
        >
          {lighting.showReflections ? "✓ REFLECTIONS ON" : "✗ REFLECTIONS OFF"}
        </button>

        {/* Texture Transform Button */}
        {!loading && textureLayersHook.textureLayers.length > 0 && (
          <ControlButton
            onClick={() => setShowTextureTransformModal(true)}
            style={{ marginTop: 12 }}
          >
            Transform Texture (All Layers)
          </ControlButton>
        )}

        {/* USDZ Export Button */}
        {!loading && modelManagerRef.current?.getModel() && (
          <div style={{ marginTop: 12 }}>
            <USDZExporterButton
              model={modelManagerRef.current.getModel()}
              filename={USDZ_CONFIG.filename}
              options={USDZ_CONFIG.options}
            />
          </div>
        )}

        {/* Texture Layers Controls - Modular Component */}
        {!loading && (
          <div style={{ marginTop: 14 }}>
            <TextureLayerManager
              model={modelManagerRef.current?.getModel()}
              textureLoader={textureManagerRef.current?.getLoader()}
              testTexturePaths={[MODEL_PATHS.TEST_IMAGES.IMAGE_1, MODEL_PATHS.TEST_IMAGES.IMAGE_2, MODEL_PATHS.TEST_IMAGES.FRAME_TEXTURE]}
              textureLayers={textureLayersHook.textureLayers.filter(
                (layer) => {
                  // Filter out back texture layers - don't show layers with "back" in the mesh name
                  // Check for variations: "back", "back_", "_back", "backside", etc.
                  const meshName = (layer.meshName || "").toLowerCase();
                  const backKeywords = ["back", "rear", "behind"];
                  return !backKeywords.some(keyword => meshName.includes(keyword));
                }
              )}
              renderer={sceneManagerRef.current?.getRenderer()}
              scene={sceneManagerRef.current?.getScene()}
              camera={sceneManagerRef.current?.getCamera()}
              collapsible={true}
              materialType={materialType.activeMaterialType}
              textureManager={textureManagerRef.current}
            />
          </div>
        )}

        {/* Mesh Visibility Controls - Collapsible */}
        {!loading && meshVisibilityHook.meshes.length > 0 && (
          <CollapsibleSection
            title="Mesh Visibility"
            isOpen={meshVisibilityHook.showMeshControls}
            onToggle={() => meshVisibilityHook.setShowMeshControls(!meshVisibilityHook.showMeshControls)}
            count={meshVisibilityHook.meshes.length}
          >
            <MeshVisibilityControls
              meshes={meshVisibilityHook.meshes}
              onToggleVisibility={toggleMeshVisibility}
            />
          </CollapsibleSection>
        )}

        {/* Lighting controls - Collapsible */}
        <CollapsibleSection
          title="Lighting Controls"
          isOpen={lighting.showLightingControls}
          onToggle={() => lighting.setShowLightingControls(!lighting.showLightingControls)}
        >
          <LightingControls
            lighting={{
              ...lighting.lighting,
              reflectionIntensity: lighting.reflectionIntensity,
            }}
            onLightingChange={lighting.setLighting}
            onReset={lighting.resetLighting}
            lightingManagerRef={lightingManagerRef}
            sceneManagerRef={sceneManagerRef}
            materialModuleRef={materialType.materialModuleRef}
            detectedMaterialType={materialType.detectedMaterialType}
          />
        </CollapsibleSection>
      </ControlsPanel>

      {/* Material Info Panel (Bottom Left) */}
      {!loading && materialSummary && (
        <MaterialInfoPanel
          materialSummary={materialSummary}
          detectedMaterialType={materialType.detectedMaterialType}
        />
      )}

      {/* Texture Transform Modal */}
      <TextureTransformModal
        isOpen={showTextureTransformModal}
        onClose={() => setShowTextureTransformModal(false)}
        textureLayers={textureLayersHook.textureLayers}
        textureLoader={textureManagerRef.current?.getLoader()}
        renderer={sceneManagerRef.current?.getRenderer()}
        testTexturePaths={[MODEL_PATHS.TEST_IMAGES.IMAGE_1, MODEL_PATHS.TEST_IMAGES.IMAGE_2]}
        meshes={meshVisibilityHook.meshes}
        allTextureLayers={textureLayersHook.allTextureLayersRef.current}
      />
    </div>
  );
}
