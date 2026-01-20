import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import USDZExporterButton from "./USDZExporter.jsx";
import TextureLayerManager from "./TextureLayerManager.jsx";
import TextureTransformModal from "./TextureTransformModal.jsx";

// =========================
// CONFIG
// =========================
const GLB_PATH = "/assets/models/Surfboard.glb";
const TEST_IMAGE_1_PATH = "/assets/frames/image1.jpg";
const TEST_IMAGE_2_PATH = "/assets/frames/image2.jpeg";

export default function GlbTextureSwapTester() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const rafRef = useRef(null);
  const modelRef = useRef(null);
  const modelBoundingBoxRef = useRef(null);
  const lightsRef = useRef({
    ambient: null,
    key: null,
    fill: null,
    rim: null,
    front: null,
    point: null,
    spot1: null,
    spot2: null,
    directional1: null,
    directional2: null,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [materialSummary, setMaterialSummary] = useState(null); // { totalMeshes, totalMaterials, byType: { [type]: count } }
  const [lighting, setLighting] = useState({
    exposure: 1.0,
    ambient: 0.4,
    key: 1.2,
    fill: 0.6,
    rim: 0.5,
    front: 0.4,
    point: 0.5,
    spot1: 1.0,
    spot2: 0.8,
    directional1: 1.0,
    directional2: 0.7,
  });
  const [lightPositions, setLightPositions] = useState({
    spot1: { x: 4, y: 6, z: 4 },
    spot1Target: { x: 0, y: 0, z: 0 },
    spot2: { x: -4, y: 6, z: -4 },
    spot2Target: { x: 0, y: 0, z: 0 },
    directional1: { x: 6, y: 4, z: 6 },
    directional2: { x: -6, y: 4, z: -6 },
  });
  const [showLightingControls, setShowLightingControls] = useState(false);
  const [showLightPositionControls, setShowLightPositionControls] = useState(false);
  const [showReflections, setShowReflections] = useState(false);
  const envMapRef = useRef(null);
  const pmremGeneratorRef = useRef(null);

  // Texture layer management
  const [textureLayers, setTextureLayers] = useState([]); // Array of { id, meshName, materialIndex, mapType, hasOriginal }
  const originalTexturesRef = useRef(new Map()); // Map<layerId, originalTexture>
  const testTexture1Ref = useRef(null);
  const testTexture2Ref = useRef(null);
  const textureLoaderRef = useRef(null);
  const [showTextureLayers, setShowTextureLayers] = useState(false);

  // Mesh visibility management
  const [meshes, setMeshes] = useState([]); // Array of { id, name, visible, mesh }
  const [showMeshControls, setShowMeshControls] = useState(false);

  // Texture Transform Modal state
  const [showTextureTransformModal, setShowTextureTransformModal] = useState(false);


  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202020);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0.6, 3.5);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = lighting.exposure;
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    // Texture loader
    const textureLoader = new THREE.TextureLoader();
    textureLoaderRef.current = textureLoader;

    // Load test textures
    textureLoader.load(TEST_IMAGE_1_PATH, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      testTexture1Ref.current = tex;
    });
    textureLoader.load(TEST_IMAGE_2_PATH, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      testTexture2Ref.current = tex;
    });

    // PMREMGenerator for environment mapping
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    pmremGeneratorRef.current = pmremGenerator;

    // Create a simple environment map for reflections
    const envScene = new THREE.Scene();

    // Add colored planes to create a simple environment
    const planeGeometry = new THREE.PlaneGeometry(20, 20);

    // Top (sky)
    const topMaterial = new THREE.MeshStandardMaterial({ color: 0x87CEEB, side: THREE.DoubleSide });
    const topPlane = new THREE.Mesh(planeGeometry, topMaterial);
    topPlane.rotation.x = Math.PI / 2;
    topPlane.position.y = 10;
    envScene.add(topPlane);

    // Bottom (ground)
    const bottomMaterial = new THREE.MeshStandardMaterial({ color: 0x8B7355, side: THREE.DoubleSide });
    const bottomPlane = new THREE.Mesh(planeGeometry, bottomMaterial);
    bottomPlane.rotation.x = -Math.PI / 2;
    bottomPlane.position.y = -10;
    envScene.add(bottomPlane);

    // Sides (walls)
    const sideColors = [0x90EE90, 0xFFB6C1, 0xDDA0DD, 0xFFE4B5];
    for (let i = 0; i < 4; i++) {
      const sideMaterial = new THREE.MeshStandardMaterial({ color: sideColors[i], side: THREE.DoubleSide });
      const sidePlane = new THREE.Mesh(planeGeometry, sideMaterial);
      const angle = (i * Math.PI) / 2;
      sidePlane.rotation.y = angle;
      sidePlane.position.set(
        Math.cos(angle) * 10,
        0,
        Math.sin(angle) * 10
      );
      envScene.add(sidePlane);
    }

    // Add some lights to the environment scene
    const envLight = new THREE.AmbientLight(0xffffff, 1.0);
    envScene.add(envLight);
    const envDirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    envDirLight.position.set(5, 10, 5);
    envScene.add(envDirLight);

    // Create environment map from the scene
    const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
    envMapRef.current = envMap;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, lighting.ambient);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, lighting.key);
    keyLight.position.set(5, 8, 5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, lighting.fill);
    fillLight.position.set(-4, 3, -4);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, lighting.rim);
    rimLight.position.set(-2, 2, -6);
    scene.add(rimLight);

    const frontLight = new THREE.DirectionalLight(0xffffff, lighting.front);
    frontLight.position.set(-3, 4, 6);
    scene.add(frontLight);

    const pointLight = new THREE.PointLight(0xffffff, lighting.point, 20);
    pointLight.position.set(0, 5, 0);
    scene.add(pointLight);

    // Spot lights for reflections
    const spotLight1 = new THREE.SpotLight(0xffffff, lighting.spot1, 30, Math.PI / 6, 0.3, 1);
    spotLight1.position.set(lightPositions.spot1.x, lightPositions.spot1.y, lightPositions.spot1.z);
    spotLight1.target.position.set(lightPositions.spot1Target.x, lightPositions.spot1Target.y, lightPositions.spot1Target.z);
    scene.add(spotLight1);
    scene.add(spotLight1.target);

    const spotLight2 = new THREE.SpotLight(0xffffff, lighting.spot2, 30, Math.PI / 6, 0.3, 1);
    spotLight2.position.set(lightPositions.spot2.x, lightPositions.spot2.y, lightPositions.spot2.z);
    spotLight2.target.position.set(lightPositions.spot2Target.x, lightPositions.spot2Target.y, lightPositions.spot2Target.z);
    scene.add(spotLight2);
    scene.add(spotLight2.target);

    // Additional directional lights for reflections
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, lighting.directional1);
    directionalLight1.position.set(lightPositions.directional1.x, lightPositions.directional1.y, lightPositions.directional1.z);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, lighting.directional2);
    directionalLight2.position.set(lightPositions.directional2.x, lightPositions.directional2.y, lightPositions.directional2.z);
    scene.add(directionalLight2);

    // Store light references
    lightsRef.current = {
      ambient: ambientLight,
      key: keyLight,
      fill: fillLight,
      rim: rimLight,
      front: frontLight,
      point: pointLight,
      spot1: spotLight1,
      spot2: spotLight2,
      directional1: directionalLight1,
      directional2: directionalLight2,
    };

    // Load GLB model
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      GLB_PATH,
      (gltf) => {
        const model = gltf.scene;
        modelRef.current = model;

        // Summarize material types and analyze texture layers
        const byType = {};
        let totalMeshes = 0;
        let totalMaterials = 0;
        const layers = [];
        const originalTextures = new Map();
        let layerIdCounter = 0;

        // Common texture map types in Three.js
        const textureMapTypes = [
          'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
          'emissiveMap', 'alphaMap', 'displacementMap', 'bumpMap',
          'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
          'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap'
        ];

        const meshList = [];
        let meshIdCounter = 0;

        // First, log ALL objects in the model to check for frame or other objects
        console.log("=== All Objects in GLB Model (Checking for Frame) ===");
        const allObjects = [];
        model.traverse((obj) => {
          allObjects.push({
            type: obj.type,
            name: obj.name || "Unnamed",
            isMesh: obj.isMesh,
            isGroup: obj.isGroup,
            isObject3D: obj.isObject3D,
            visible: obj.visible,
            children: obj.children.length,
            object: obj
          });
        });
        console.log(`Total objects in model: ${allObjects.length}`);
        allObjects.forEach((objInfo, idx) => {
          console.log(`\n${idx + 1}. ${objInfo.name} (${objInfo.type})`);
          console.log(`   Type: ${objInfo.type}`);
          console.log(`   Is Mesh: ${objInfo.isMesh}`);
          console.log(`   Is Group: ${objInfo.isGroup}`);
          console.log(`   Visible: ${objInfo.visible}`);
          console.log(`   Children: ${objInfo.children}`);
          // Check if name contains "frame" (case insensitive)
          if (objInfo.name && objInfo.name.toLowerCase().includes("frame")) {
            console.log(`   ⚠️  FRAME DETECTED! This might be an embedded frame.`);
          }
        });
        console.log("====================================================\n");

        model.traverse((obj) => {
          if (!obj.isMesh || !obj.material) return;
          totalMeshes += 1;

          // Track mesh visibility
          const meshId = `mesh_${meshIdCounter++}`;
          const meshInfo = {
            id: meshId,
            name: obj.name || `Mesh_${totalMeshes}`,
            visible: obj.visible,
            mesh: obj
          };
          meshList.push(meshInfo);

          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          totalMaterials += mats.length;

          mats.forEach((mat, matIndex) => {
            const t = mat?.type || "UnknownMaterial";
            byType[t] = (byType[t] || 0) + 1;

            // Analyze texture layers for this material
            textureMapTypes.forEach((mapType) => {
              if (mat[mapType]) {
                const layerId = `layer_${layerIdCounter++}`;
                const layerInfo = {
                  id: layerId,
                  meshName: obj.name || `Mesh_${totalMeshes}`,
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

        setMaterialSummary({ totalMeshes, totalMaterials, byType });
        setTextureLayers(layers);
        originalTexturesRef.current = originalTextures;
        setMeshes(meshList);

        // Console log all texture layers grouped by mesh
        console.log("=== All Texture Layers (Available for Texture Application) ===");
        console.log(`Total texture layers: ${layers.length}`);

        // Group layers by mesh name
        const layersByMesh = {};
        layers.forEach((layer) => {
          const meshName = layer.meshName || "Unnamed";
          if (!layersByMesh[meshName]) {
            layersByMesh[meshName] = [];
          }
          layersByMesh[meshName].push(layer);
        });

        // Print grouped by mesh
        Object.entries(layersByMesh).forEach(([meshName, meshLayers]) => {
          console.log(`\n📦 Mesh: ${meshName} (${meshLayers.length} texture layer(s))`);
          meshLayers.forEach((layer, idx) => {
            console.log(`  ${idx + 1}. Layer ID: ${layer.id}`);
            console.log(`     Map Type: ${layer.mapType}`);
            console.log(`     Material Index: ${layer.materialIndex}`);
            console.log(`     Has Original Texture: ${layer.hasOriginal}`);
          });
        });

        console.log("\n=== Summary ===");
        console.log(`Total Meshes: ${meshList.length}`);
        console.log(`Total Texture Layers: ${layers.length}`);
        console.log("===========================");

        // Center and scale model
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        model.position.sub(center);
        
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        model.scale.multiplyScalar(2.5 / maxDim);

        const scaledBox = new THREE.Box3().setFromObject(model);
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        model.position.sub(scaledCenter);
        
        const finalBox = new THREE.Box3().setFromObject(model);
        modelBoundingBoxRef.current = finalBox;

        scene.add(model);
        setLoading(false);
      },
      undefined,
      (e) => {
        setError(e?.message || "Failed to load GLB");
        setLoading(false);
      }
    );

    // Animation loop
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      
      if (controlsRef.current) controlsRef.current.dispose();
      if (envMapRef.current) {
        envMapRef.current.dispose();
        envMapRef.current = null;
      }
      if (pmremGeneratorRef.current) {
        pmremGeneratorRef.current.dispose();
        pmremGeneratorRef.current = null;
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (mountRef.current?.contains(rendererRef.current.domElement)) {
          mountRef.current.removeChild(rendererRef.current.domElement);
        }
      }
    };
  }, []);

  // Live lighting updates
  useEffect(() => {
    if (!rendererRef.current || !lightsRef.current) return;

    const r = rendererRef.current;
    r.toneMappingExposure = lighting.exposure;

    const l = lightsRef.current;
    if (l.ambient) l.ambient.intensity = lighting.ambient;
    if (l.key) l.key.intensity = lighting.key;
    if (l.fill) l.fill.intensity = lighting.fill;
    if (l.rim) l.rim.intensity = lighting.rim;
    if (l.front) l.front.intensity = lighting.front;
    if (l.point) l.point.intensity = lighting.point;

    if (l.spot1) {
      l.spot1.intensity = lighting.spot1;
      l.spot1.position.set(lightPositions.spot1.x, lightPositions.spot1.y, lightPositions.spot1.z);
      l.spot1.target.position.set(lightPositions.spot1Target.x, lightPositions.spot1Target.y, lightPositions.spot1Target.z);
      l.spot1.target.updateMatrixWorld();
    }
    if (l.spot2) {
      l.spot2.intensity = lighting.spot2;
      l.spot2.position.set(lightPositions.spot2.x, lightPositions.spot2.y, lightPositions.spot2.z);
      l.spot2.target.position.set(lightPositions.spot2Target.x, lightPositions.spot2Target.y, lightPositions.spot2Target.z);
      l.spot2.target.updateMatrixWorld();
    }
    if (l.directional1) {
      l.directional1.intensity = lighting.directional1;
      l.directional1.position.set(lightPositions.directional1.x, lightPositions.directional1.y, lightPositions.directional1.z);
    }
    if (l.directional2) {
      l.directional2.intensity = lighting.directional2;
      l.directional2.position.set(lightPositions.directional2.x, lightPositions.directional2.y, lightPositions.directional2.z);
    }
  }, [lighting, lightPositions]);

  // Toggle reflections on/off
  useEffect(() => {
    if (!sceneRef.current || !envMapRef.current) return;

    if (showReflections) {
      sceneRef.current.environment = envMapRef.current;
      // Also apply to model materials
      if (modelRef.current) {
        modelRef.current.traverse((obj) => {
          if (obj.isMesh && obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((mat) => {
              if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
                mat.envMap = envMapRef.current;
                mat.envMapIntensity = 1.0;
                mat.needsUpdate = true;
              }
            });
          }
        });
      }
      } else {
      sceneRef.current.environment = null;
      // Remove from model materials
      if (modelRef.current) {
        modelRef.current.traverse((obj) => {
          if (obj.isMesh && obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((mat) => {
              if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
                mat.envMap = null;
      mat.needsUpdate = true;
    }
            });
          }
        });
      }
    }
  }, [showReflections]);

  // Apply test texture to a specific layer
  const applyTestTextureToLayer = (layerId, textureNumber) => {
    const layer = textureLayers.find(l => l.id === layerId);
    if (!layer || !layer.material || !layer.mesh) {
      console.warn(`Layer ${layerId} not found or invalid`);
      return;
    }

    // Get fresh reference to mesh (in case it was cloned or replaced)
    const mesh = layer.mesh;
    if (!mesh || !mesh.material) {
      console.warn(`Mesh for layer ${layerId} is invalid`);
      return;
    }

    const testTex = textureNumber === 1 ? testTexture1Ref.current : testTexture2Ref.current;
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
    // Get fresh reference to ensure we're working with current material
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
    
    // Force renderer update
    if (rendererRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
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

    // Get the material (handle both single material and material arrays)
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
      
      // Force renderer update
      if (rendererRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    } else {
      console.warn(`No original texture found for layer ${layerId}`);
    }
  };

  // =========================
  // MESH VISIBILITY FUNCTIONS
  // =========================

  const toggleMeshVisibility = (meshId) => {
    setMeshes(prev => prev.map(m => {
      if (m.id === meshId) {
        const newVisible = !m.visible;
        if (m.mesh) {
          m.mesh.visible = newVisible;
        }
        return { ...m, visible: newVisible };
      }
      return m;
    }));
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {/* Simple Controls Panel */}
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          width: 200,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "rgba(0,0,0,0.85)",
          color: "white",
          padding: 16,
          borderRadius: 10,
          zIndex: 10,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>
          Controls
        </div>

        {loading && <div style={{ color: "#7CFC00", marginBottom: 12 }}>Loading…</div>}
        {error && <div style={{ color: "#ff6b6b", marginBottom: 12 }}>ERROR: {error}</div>}

        <button
          onClick={() => setShowReflections(!showReflections)}
          style={{
            width: "100%",
            padding: 14,
            border: 0,
            borderRadius: 6,
            background: showReflections ? "#4CAF50" : "#666",
            color: "white",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 14,
              marginTop: 12,
            transition: "background-color 0.2s",
            boxShadow: showReflections ? "0 0 10px rgba(76, 175, 80, 0.5)" : "none",
          }}
          onMouseEnter={(e) => {
            e.target.style.background = showReflections ? "#45a049" : "#777";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = showReflections ? "#4CAF50" : "#666";
          }}
        >
          {showReflections ? "✓ REFLECTIONS ON" : "✗ REFLECTIONS OFF"}
        </button>

        {/* Texture Transform Button */}
        {!loading && textureLayers.length > 0 && (
          <button
            onClick={() => setShowTextureTransformModal(true)}
              style={{
              width: "100%",
              padding: 14,
              border: 0,
              borderRadius: 6,
              background: "#2196F3",
              color: "white",
              cursor: "pointer",
                fontWeight: 700,
                fontSize: 14,
              marginTop: 12,
              transition: "background-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "#1976D2";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "#2196F3";
            }}
          >
            Transform Texture (All Layers)
          </button>
        )}

        {/* USDZ Export Button */}
        {!loading && modelRef.current && (
          <div style={{ marginTop: 12 }}>
            <USDZExporterButton
              model={modelRef.current}
              filename="model.usdz"
              options={{
                maxTextureSize: 2048,
              }}
            />
          </div>
        )}

        {/* Texture Layers Controls - Modular Component */}
        {!loading && (
          <div style={{ marginTop: 14 }}>
            <TextureLayerManager
              model={modelRef.current}
              textureLoader={textureLoaderRef.current}
              testTexturePaths={[TEST_IMAGE_1_PATH, TEST_IMAGE_2_PATH]}
              textureLayers={textureLayers}
              renderer={rendererRef.current}
              scene={sceneRef.current}
              camera={cameraRef.current}
              collapsible={true}
            />
          </div>
        )}

        {/* Mesh Visibility Controls - Collapsible */}
        {!loading && meshes.length > 0 && (
          <div style={{ marginTop: 14, fontFamily: "monospace", fontSize: 12 }}>
            <button
              onClick={() => setShowMeshControls(!showMeshControls)}
        style={{
                width: "100%",
                padding: 10,
                border: 0,
                borderRadius: 6,
                background: showMeshControls ? "#555" : "#444",
          color: "white",
                cursor: "pointer",
                fontWeight: 700,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Mesh Visibility ({meshes.length})</span>
              <span>{showMeshControls ? "−" : "+"}</span>
            </button>

            {showMeshControls && (
              <div style={{ marginTop: 10, maxHeight: "400px", overflowY: "auto", paddingRight: 4 }}>
                {meshes.map((mesh) => (
                  <div
                    key={mesh.id}
          style={{
                      marginBottom: 8,
            padding: 8,
                      background: "rgba(255,255,255,0.05)",
            borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.1)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 2 }}>
                        {mesh.name || "Unnamed Mesh"}
                      </div>
                      <div style={{ fontSize: 10, opacity: 0.7 }}>
                        {mesh.visible ? "Visible" : "Hidden"}
                      </div>
                    </div>
        <button
                      onClick={() => toggleMeshVisibility(mesh.id)}
          style={{
                        padding: "6px 12px",
            border: 0,
                        borderRadius: 4,
                        background: mesh.visible ? "#4CAF50" : "#666",
            color: "white",
            cursor: "pointer",
                        fontSize: 10,
                        fontWeight: 600,
                        minWidth: 60,
                      }}
                    >
                      {mesh.visible ? "ON" : "OFF"}
        </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Lighting controls - Collapsible */}
        <div style={{ marginTop: 14, fontFamily: "monospace", fontSize: 12 }}>
          <button
            onClick={() => setShowLightingControls(!showLightingControls)}
            style={{
              width: "100%",
              padding: 10,
              border: 0,
              borderRadius: 6,
              background: showLightingControls ? "#555" : "#444",
              color: "white",
              cursor: "pointer",
              fontWeight: 700,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Lighting Controls</span>
            <span>{showLightingControls ? "−" : "+"}</span>
          </button>

          {showLightingControls && (
            <div style={{ marginTop: 10 }}>
              {[
                { key: "exposure", label: "Exposure", min: 0.2, max: 2.5, step: 0.01 },
                { key: "ambient", label: "Ambient", min: 0, max: 2, step: 0.01 },
                { key: "key", label: "Key", min: 0, max: 3, step: 0.01 },
                { key: "fill", label: "Fill", min: 0, max: 3, step: 0.01 },
                { key: "rim", label: "Rim", min: 0, max: 3, step: 0.01 },
                { key: "front", label: "Front", min: 0, max: 3, step: 0.01 },
                { key: "point", label: "Point", min: 0, max: 3, step: 0.01 },
                { key: "spot1", label: "Spot 1", min: 0, max: 3, step: 0.01 },
                { key: "spot2", label: "Spot 2", min: 0, max: 3, step: 0.01 },
                { key: "directional1", label: "Directional 1", min: 0, max: 3, step: 0.01 },
                { key: "directional2", label: "Directional 2", min: 0, max: 3, step: 0.01 },
              ].map((s) => (
                <div key={s.key} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, opacity: 0.9 }}>
                    <span>{s.label}</span>
                    <span>{lighting[s.key].toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={lighting[s.key]}
                    onChange={(e) =>
                      setLighting((prev) => ({
                        ...prev,
                        [s.key]: parseFloat(e.target.value),
                      }))
                    }
                    style={{ width: "100%" }}
                  />
                </div>
              ))}

          <button
                onClick={() => {
                  setLighting({
                    exposure: 1.0,
                    ambient: 0.4,
                    key: 1.2,
                    fill: 0.6,
                    rim: 0.5,
                    front: 0.4,
                    point: 0.5,
                    spot1: 1.0,
                    spot2: 0.8,
                    directional1: 1.0,
                    directional2: 0.7,
                  });
                }}
            style={{
                  width: "100%",
              padding: 10,
              border: 0,
              borderRadius: 6,
                  background: "#444",
              color: "white",
              cursor: "pointer",
              fontWeight: 700,
                  marginTop: 12,
            }}
          >
                Reset Intensity
          </button>
            </div>
          )}
        </div>

        {/* Light Position Controls - Separate Collapsible Block */}
        <div style={{ marginTop: 14, fontFamily: "monospace", fontSize: 12 }}>
          <button
            onClick={() => setShowLightPositionControls(!showLightPositionControls)}
            style={{
              width: "100%",
              padding: 10,
              border: 0,
              borderRadius: 6,
              background: showLightPositionControls ? "#555" : "#444",
              color: "white",
              cursor: "pointer",
              fontWeight: 700,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Light Position Controls</span>
            <span>{showLightPositionControls ? "−" : "+"}</span>
          </button>

          {showLightPositionControls && (
            <div style={{ marginTop: 10, maxHeight: "400px", overflowY: "auto", paddingRight: 4 }}>
              {/* Spot Light 1 Position Controls */}
              <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 11, opacity: 0.9 }}>Spot Light 1 Position</div>
                {["x", "y", "z"].map((axis) => (
                  <div key={axis} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, opacity: 0.9, fontSize: 11 }}>
                      <span>{axis.toUpperCase()}</span>
                      <span>{lightPositions.spot1[axis].toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={-10}
                      max={10}
                      step={0.1}
                      value={lightPositions.spot1[axis]}
                      onChange={(e) =>
                        setLightPositions((prev) => ({
                          ...prev,
                          spot1: { ...prev.spot1, [axis]: parseFloat(e.target.value) },
                        }))
                      }
                      style={{ width: "100%" }}
                    />
                  </div>
                ))}
                <div style={{ fontWeight: 700, marginTop: 12, marginBottom: 8, fontSize: 11, opacity: 0.9 }}>Spot Light 1 Target</div>
                {["x", "y", "z"].map((axis) => (
                  <div key={`target-${axis}`} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, opacity: 0.9, fontSize: 11 }}>
                      <span>{axis.toUpperCase()}</span>
                      <span>{lightPositions.spot1Target[axis].toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={-5}
                      max={5}
                      step={0.1}
                      value={lightPositions.spot1Target[axis]}
                      onChange={(e) =>
                        setLightPositions((prev) => ({
                          ...prev,
                          spot1Target: { ...prev.spot1Target, [axis]: parseFloat(e.target.value) },
                        }))
                      }
                      style={{ width: "100%" }}
                    />
                  </div>
                ))}
              </div>

              {/* Spot Light 2 Position Controls */}
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 11, opacity: 0.9 }}>Spot Light 2 Position</div>
                {["x", "y", "z"].map((axis) => (
                  <div key={axis} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, opacity: 0.9, fontSize: 11 }}>
                      <span>{axis.toUpperCase()}</span>
                      <span>{lightPositions.spot2[axis].toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={-10}
                      max={10}
                      step={0.1}
                      value={lightPositions.spot2[axis]}
                      onChange={(e) =>
                        setLightPositions((prev) => ({
                          ...prev,
                          spot2: { ...prev.spot2, [axis]: parseFloat(e.target.value) },
                        }))
                      }
                      style={{ width: "100%" }}
                    />
                  </div>
                ))}
                <div style={{ fontWeight: 700, marginTop: 12, marginBottom: 8, fontSize: 11, opacity: 0.9 }}>Spot Light 2 Target</div>
                {["x", "y", "z"].map((axis) => (
                  <div key={`target-${axis}`} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, opacity: 0.9, fontSize: 11 }}>
                      <span>{axis.toUpperCase()}</span>
                      <span>{lightPositions.spot2Target[axis].toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={-5}
                      max={5}
                      step={0.1}
                      value={lightPositions.spot2Target[axis]}
                      onChange={(e) =>
                        setLightPositions((prev) => ({
                          ...prev,
                          spot2Target: { ...prev.spot2Target, [axis]: parseFloat(e.target.value) },
                        }))
                      }
                      style={{ width: "100%" }}
                    />
                  </div>
                ))}
              </div>

              {/* Directional Light 1 Position Controls */}
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 11, opacity: 0.9 }}>Directional Light 1 Position</div>
                {["x", "y", "z"].map((axis) => (
                  <div key={axis} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, opacity: 0.9, fontSize: 11 }}>
                      <span>{axis.toUpperCase()}</span>
                      <span>{lightPositions.directional1[axis].toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={-10}
                      max={10}
                      step={0.1}
                      value={lightPositions.directional1[axis]}
                      onChange={(e) =>
                        setLightPositions((prev) => ({
                          ...prev,
                          directional1: { ...prev.directional1, [axis]: parseFloat(e.target.value) },
                        }))
                      }
                      style={{ width: "100%" }}
                    />
                  </div>
                ))}
              </div>

              {/* Directional Light 2 Position Controls */}
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 11, opacity: 0.9 }}>Directional Light 2 Position</div>
                {["x", "y", "z"].map((axis) => (
                  <div key={axis} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, opacity: 0.9, fontSize: 11 }}>
                      <span>{axis.toUpperCase()}</span>
                      <span>{lightPositions.directional2[axis].toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={-10}
                      max={10}
                      step={0.1}
                      value={lightPositions.directional2[axis]}
                      onChange={(e) =>
                        setLightPositions((prev) => ({
                          ...prev,
                          directional2: { ...prev.directional2, [axis]: parseFloat(e.target.value) },
                        }))
                      }
                      style={{ width: "100%" }}
                    />
                  </div>
                ))}
              </div>

          <button
                onClick={() => {
                  setLightPositions({
                    spot1: { x: 4, y: 6, z: 4 },
                    spot1Target: { x: 0, y: 0, z: 0 },
                    spot2: { x: -4, y: 6, z: -4 },
                    spot2Target: { x: 0, y: 0, z: 0 },
                    directional1: { x: 6, y: 4, z: 6 },
                    directional2: { x: -6, y: 4, z: -6 },
                  });
                }}
            style={{
                  width: "100%",
              padding: 10,
              border: 0,
              borderRadius: 6,
                  background: "#444",
              color: "white",
              cursor: "pointer",
              fontWeight: 700,
                  marginTop: 12,
            }}
          >
                Reset Positions
          </button>
            </div>
          )}
        </div>
        </div>

      {/* Bottom info box: material types summary */}
      <div
          style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          maxWidth: 520,
          background: "rgba(0,0,0,0.75)",
          color: "white",
          padding: 12,
          borderRadius: 10,
          zIndex: 10,
          fontFamily: "monospace",
          fontSize: 12,
          lineHeight: 1.35,
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Model Material Info</div>
        {loading && <div style={{ opacity: 0.9 }}>Loading…</div>}
        {!loading && error && <div style={{ color: "#ff6b6b" }}>ERROR: {error}</div>}
        {!loading && !error && materialSummary && (
          <>
            <div style={{ opacity: 0.9, marginBottom: 6 }}>
              Meshes: {materialSummary.totalMeshes} • Materials: {materialSummary.totalMaterials}
            </div>
            <div>
              {Object.entries(materialSummary.byType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type}>
                    {type}: {count}
                  </div>
                ))}
            </div>
          </>
        )}
        {!loading && !error && !materialSummary && (
          <div style={{ opacity: 0.9 }}>No material info available.</div>
        )}
      </div>

      {/* Texture Transform Modal */}
      <TextureTransformModal
        isOpen={showTextureTransformModal}
        onClose={() => setShowTextureTransformModal(false)}
        textureLayers={textureLayers}
        textureLoader={textureLoaderRef.current}
        renderer={rendererRef.current}
        testTexturePaths={[TEST_IMAGE_1_PATH, TEST_IMAGE_2_PATH]}
      />
    </div>
  );
}
