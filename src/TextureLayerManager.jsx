import { useState, useRef, useEffect } from "react";
import * as THREE from "three";

/**
 * TextureLayerManager Component
 * 
 * A reusable component for managing texture layers on a 3D model.
 * Automatically detects all texture layers and provides UI to apply test textures.
 * 
 * @example
 * ```jsx
 * import TextureLayerManager from './TextureLayerManager';
 * 
 * <TextureLayerManager
 *   model={myModel}
 *   textureLoader={textureLoader}
 *   testTexturePaths={["/path/to/texture1.jpg", "/path/to/texture2.jpg"]}
 *   renderer={renderer}
 *   scene={scene}
 *   camera={camera}
 *   collapsible={true}
 *   onLayerChange={(layerId, textureNumber, texture) => {
 *     console.log('Layer changed:', layerId, textureNumber);
 *   }}
 * />
 * ```
 * 
 * @param {Object} props
 * @param {THREE.Object3D} props.model - The 3D model to manage textures for
 * @param {THREE.TextureLoader} props.textureLoader - Optional texture loader (creates one if not provided)
 * @param {string[]} props.testTexturePaths - Array of test texture paths (default: ["/assets/frames/image1.jpg", "/assets/frames/image2.jpeg"])
 * @param {string[]} props.textureMapTypes - Array of texture map types to detect (default: common PBR maps)
 * @param {Array} props.textureLayers - Optional pre-detected texture layers (if provided, won't auto-detect)
 * @param {Function} props.onLayersDetected - Optional callback when layers are detected (receives layers array and originalTextures Map)
 * @param {Function} props.onLayerChange - Optional callback when a layer is changed (layerId, textureNumber, texture)
 * @param {Object} props.renderer - Optional renderer reference for forcing updates
 * @param {Object} props.scene - Optional scene reference for forcing updates
 * @param {Object} props.camera - Optional camera reference for forcing updates
 * @param {boolean} props.collapsible - Whether the UI should be collapsible (default: true)
 * @param {Object} props.style - Optional custom styles for the container
 */
export default function TextureLayerManager({
  model,
  textureLoader,
  testTexturePaths = ["/assets/frames/image1.jpg", "/assets/frames/image2.jpeg"],
  textureMapTypes = [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
    'emissiveMap', 'alphaMap', 'displacementMap', 'bumpMap',
    'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
    'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap'
  ],
  textureLayers: externalTextureLayers,
  onLayersDetected,
  onLayerChange,
  renderer,
  scene,
  camera,
  collapsible = true,
  style = {}
}) {
  const [textureLayers, setTextureLayers] = useState(externalTextureLayers || []);
  const [showLayers, setShowLayers] = useState(!collapsible);
  const [loading, setLoading] = useState(!externalTextureLayers);
  
  const originalTexturesRef = useRef(new Map());
  const testTexturesRef = useRef([]);
  const loaderRef = useRef(textureLoader || new THREE.TextureLoader());

  // Sync external textureLayers if provided
  useEffect(() => {
    if (externalTextureLayers) {
      setTextureLayers(externalTextureLayers);
      setLoading(false);
    }
  }, [externalTextureLayers]);

  // Detect texture layers from model (only if not provided externally)
  useEffect(() => {
    if (!model || externalTextureLayers) {
      if (externalTextureLayers) {
        setLoading(false);
      }
      return;
    }

    const layers = [];
    const originalTextures = new Map();
    let layerIdCounter = 0;

    model.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

      mats.forEach((mat, matIndex) => {
        textureMapTypes.forEach((mapType) => {
          if (mat[mapType]) {
            const layerId = `layer_${layerIdCounter++}`;
            const layerInfo = {
              id: layerId,
              meshName: obj.name || "Unnamed",
              materialIndex: matIndex,
              mapType: mapType,
              hasOriginal: true,
              material: mat,
              mesh: obj
            };
            layers.push(layerInfo);
            // Store original texture
            originalTextures.set(layerId, mat[mapType]);
          }
        });
      });
    });

    setTextureLayers(layers);
    originalTexturesRef.current = originalTextures;
    setLoading(false);
    
    // Notify parent if callback provided
    if (onLayersDetected) {
      onLayersDetected(layers, originalTextures);
    }
  }, [model, textureMapTypes, externalTextureLayers, onLayersDetected]);

  // Load test textures
  useEffect(() => {
    if (!model || testTexturePaths.length === 0) return;

    testTexturesRef.current = [];
    let loadedCount = 0;

    testTexturePaths.forEach((path, index) => {
      loaderRef.current.load(
        path,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          testTexturesRef.current[index] = texture;
          loadedCount++;
        },
        undefined,
        (error) => {
          console.warn(`Failed to load test texture ${index + 1}:`, error);
          testTexturesRef.current[index] = null;
          loadedCount++;
        }
      );
    });
  }, [model, testTexturePaths]);

  // Apply test texture to a specific layer
  const applyTestTextureToLayer = (layerId, textureNumber) => {
    const layer = textureLayers.find(l => l.id === layerId);
    if (!layer || !layer.material || !layer.mesh) {
      console.warn(`Layer ${layerId} not found or invalid`);
      return;
    }

    // Get fresh reference to mesh
    const mesh = layer.mesh;
    if (!mesh || !mesh.material) {
      console.warn(`Mesh for layer ${layerId} is invalid`);
      return;
    }

    const testTex = testTexturesRef.current[textureNumber - 1];
    if (!testTex) {
      console.warn(`Test texture ${textureNumber} not loaded yet`);
      return;
    }

    // Check if texture image is actually loaded
    if (!testTex.image || (testTex.image instanceof HTMLImageElement && !testTex.image.complete)) {
      console.warn(`Test texture ${textureNumber} image not ready yet`);
      // Wait for texture to load
      if (testTex.image instanceof HTMLImageElement) {
        testTex.image.onload = () => {
          // Retry after image loads
          setTimeout(() => applyTestTextureToLayer(layerId, textureNumber), 100);
        };
      }
      return;
    }

    // Get the material (handle both single material and material arrays)
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const mat = mats[layer.materialIndex];
    if (!mat) {
      console.warn(`Material at index ${layer.materialIndex} not found`);
      return;
    }

    // Clone the texture to avoid sharing references
    const clonedTex = testTex.clone();
    clonedTex.colorSpace = THREE.SRGBColorSpace;
    clonedTex.needsUpdate = true;

    // Apply to the material
    mat[layer.mapType] = clonedTex;
    mat.needsUpdate = true;

    // Force renderer update if available
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }

    // Call callback if provided
    if (onLayerChange) {
      onLayerChange(layerId, textureNumber, clonedTex);
    }
  };

  // Reset a layer to its original texture
  const resetLayerToOriginal = (layerId) => {
    const layer = textureLayers.find(l => l.id === layerId);
    if (!layer || !layer.material || !layer.mesh) {
      console.warn(`Layer ${layerId} not found or invalid`);
      return;
    }

    // Get fresh reference to mesh
    const mesh = layer.mesh;
    if (!mesh || !mesh.material) {
      console.warn(`Mesh for layer ${layerId} is invalid`);
      return;
    }

    // Get the material
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const mat = mats[layer.materialIndex];
    if (!mat) {
      console.warn(`Material at index ${layer.materialIndex} not found`);
      return;
    }

    const originalTex = originalTexturesRef.current.get(layerId);
    if (originalTex) {
      mat[layer.mapType] = originalTex;
      mat.needsUpdate = true;

      // Force renderer update if available
      if (renderer && scene && camera) {
        renderer.render(scene, camera);
      }

      // Call callback if provided
      if (onLayerChange) {
        onLayerChange(layerId, null, originalTex);
      }
    } else {
      console.warn(`No original texture found for layer ${layerId}`);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 10, color: "white", fontSize: 12, ...style }}>
        Loading texture layers...
      </div>
    );
  }

  if (textureLayers.length === 0) {
    return (
      <div style={{ padding: 10, color: "white", fontSize: 12, opacity: 0.7, ...style }}>
        No texture layers found
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "monospace", fontSize: 12, ...style }}>
      {collapsible && (
        <button
          onClick={() => setShowLayers(!showLayers)}
          style={{
            width: "100%",
            padding: 10,
            border: 0,
            borderRadius: 6,
            background: showLayers ? "#555" : "#444",
            color: "white",
            cursor: "pointer",
            fontWeight: 700,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Texture Layers ({textureLayers.length})</span>
          <span>{showLayers ? "−" : "+"}</span>
        </button>
      )}

      {showLayers && (
        <div style={{ marginTop: collapsible ? 10 : 0, maxHeight: "400px", overflowY: "auto", paddingRight: 4 }}>
          {textureLayers.map((layer) => (
            <div
              key={layer.id}
              style={{
                marginBottom: 12,
                padding: 10,
                background: "rgba(255,255,255,0.05)",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 11 }}>
                {layer.mapType}
              </div>
              <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 8 }}>
                Mesh: {layer.meshName || "Unnamed"} • Material: {layer.materialIndex}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {testTexturePaths.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => applyTestTextureToLayer(layer.id, index + 1)}
                    style={{
                      flex: 1,
                      padding: 6,
                      border: 0,
                      borderRadius: 4,
                      background: index === 0 ? "#4CAF50" : "#2196F3",
                      color: "white",
                      cursor: "pointer",
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    Test {index + 1}
                  </button>
                ))}
                <button
                  onClick={() => resetLayerToOriginal(layer.id)}
                  style={{
                    flex: 1,
                    padding: 6,
                    border: 0,
                    borderRadius: 4,
                    background: "#666",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
