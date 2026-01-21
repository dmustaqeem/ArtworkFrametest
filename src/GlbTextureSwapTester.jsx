import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
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
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [materialSummary, setMaterialSummary] = useState(null); // { totalMeshes, totalMaterials, byType: { [type]: count } }
  const [lighting, setLighting] = useState({
    exposure: 1.40, // Even brighter for WhiteWall-style high-key look
    ambient: 0.05, // WhiteWall-style: very low (reduced from 0.15 to avoid flat lighting)
    key: 0.45, // WhiteWall-style: subtle key light (reduced from 0.6)
    fill: 0.25, // WhiteWall-style: soft fill (reduced from 0.3)
    rim: 0.35, // WhiteWall-style: edge highlight (reduced from 0.4)
  });
  const [envRotation, setEnvRotation] = useState(0); // HDRI / environment yaw (degrees)
  const [showLightingControls, setShowLightingControls] = useState(false);
  const [showReflections, setShowReflections] = useState(true); // Default to true for WhiteWall-style
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

    // Scene setup - WhiteWall-style high-key background
    const scene = new THREE.Scene();
    // For WhiteWall-style gradient background we keep the scene background transparent
    // and render a CSS gradient behind the canvas.
    scene.background = null;
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

    // Renderer - WhiteWall-style settings
    // alpha: true so CSS gradient background shows through
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // Critical for print-accurate colors
    renderer.toneMappingExposure = lighting.exposure;
    // Transparent clear color so CSS gradient is visible
    renderer.setClearColor(0x000000, 0);
    
    // Enable shadows for WhiteWall-style grounding
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Enable physically correct lights for better transmission/refraction
    renderer.physicallyCorrectLights = true;
    
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

    // Create WhiteWall-style studio environment map
    // This mimics a soft, bright studio HDRI for even illumination
    const createStudioEnvironment = () => {
      const envScene = new THREE.Scene();
      
      // WhiteWall-style softbox environment: bright panels that create distinct reflection streaks
      // This produces recognizable highlights like a real photo studio
      
      // Big TOP softbox - strongest highlight (creates top strip light)
      const top = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 18),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xffffff,
          emissiveIntensity: 3.0, // Much brighter for distinct highlights
          side: THREE.DoubleSide
        })
      );
      top.rotation.x = Math.PI / 2;
      top.position.set(0, 10, 0);
      envScene.add(top);

      // LEFT softbox - medium brightness
      const left = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xffffff,
          emissiveIntensity: 1.6,
          side: THREE.DoubleSide
        })
      );
      left.rotation.y = Math.PI / 2;
      left.position.set(-10, 2, 0);
      envScene.add(left);

      // RIGHT softbox - medium brightness
      const right = left.clone();
      right.position.set(10, 2, 0);
      right.rotation.y = -Math.PI / 2;
      envScene.add(right);

      // BACK softbox - low brightness (subtle fill)
      const back = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xffffff,
          emissiveIntensity: 0.6,
          side: THREE.DoubleSide
        })
      );
      back.position.set(0, 2, -12);
      envScene.add(back);

      // Keep rest DARK so reflections have contrast (not flat lighting)
      // Very low ambient so bright panels create distinct highlights
      envScene.add(new THREE.AmbientLight(0xffffff, 0.05));

      // Dark wrap for contrast control (WhiteWall reflections need darker areas too)
      // This large dark sphere increases reflection contrast massively
      const wrap = new THREE.Mesh(
        new THREE.SphereGeometry(60, 32, 16),
        new THREE.MeshStandardMaterial({
          color: 0x111111, // Very dark
          metalness: 0,
          roughness: 1,
          side: THREE.BackSide // Inside faces only
        })
      );
      envScene.add(wrap);

      // Create environment map from the softbox scene
      const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
      return envMap;
    };

    // Set up environment map:
    // Prefer a real high-key studio HDRI if present, otherwise fallback to our procedural studio environment.
    const HDRI_PATH = "/assets/hdr/studio.hdr";
    const setEnvironment = (newEnvMap) => {
      if (!newEnvMap) return;
      if (envMapRef.current && envMapRef.current !== newEnvMap) {
        try {
          envMapRef.current.dispose();
        } catch {
          // ignore
        }
      }
      envMapRef.current = newEnvMap;
      // Always set environment - toggling is handled by the [showReflections] effect
      scene.environment = newEnvMap;
    };

    // Set fallback immediately (scene needs lighting right away)
    const fallbackEnv = createStudioEnvironment();
    setEnvironment(fallbackEnv);

    // Try to load real HDRI (will replace fallback if successful)
    new RGBELoader()
      .setDataType(THREE.HalfFloatType)
      .load(
        HDRI_PATH,
        (hdrTex) => {
          // RGBELoader expects hdrTex to have .image property
          // Check if texture is valid before processing
          if (!hdrTex || !hdrTex.image) {
            console.log("HDRI loaded but invalid, using fallback");
            return; // Keep fallback environment
          }
          try {
            const newEnvMap = pmremGenerator.fromEquirectangular(hdrTex).texture;
            hdrTex.dispose();
            setEnvironment(newEnvMap);
          } catch (err) {
            console.warn("Failed to process HDRI:", err);
            // Keep fallback environment
          }
        },
        undefined,
        () => {
          // Error callback: HDRI file not found
          console.log("HDRI not found, using procedural studio environment");
          // Fallback already set above
        }
      );

    // WhiteWall-style lighting: Minimal, subtle lights
    // 90% of lighting comes from environment map (HDRI), only subtle direct lights for edge definition
    
    // Very low ambient (WhiteWall avoids strong ambient)
    const ambientLight = new THREE.AmbientLight(0xffffff, lighting.ambient);
    scene.add(ambientLight);

    // Subtle key light (main directional) - with shadows for grounding
    const keyLight = new THREE.DirectionalLight(0xffffff, lighting.key);
    keyLight.position.set(6, 8, 6); // WhiteWall-style position
    keyLight.castShadow = true; // Enable shadows for WhiteWall-style grounding
    keyLight.shadow.mapSize.set(2048, 2048);
    
    // Set shadow camera bounds for proper shadow coverage
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 50;
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    keyLight.shadow.bias = -0.0002; // Prevent shadow acne
    
    scene.add(keyLight);

    // Subtle fill light (softens shadows)
    const fillLight = new THREE.DirectionalLight(0xffffff, lighting.fill);
    fillLight.position.set(-6, 4, -6); // WhiteWall-style position
    scene.add(fillLight);

    // Subtle rim light (edge readability)
    const rimLight = new THREE.DirectionalLight(0xffffff, lighting.rim);
    rimLight.position.set(-6, 6, -6);
    scene.add(rimLight);

    // Store light references
    lightsRef.current = {
      ambient: ambientLight,
      key: keyLight,
      fill: fillLight,
      rim: rimLight,
    };

    // Shadow catcher (subtle grounding like WhiteWall)
    // Position will be set after model is loaded and scaled
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ opacity: 0.08 }) // Very subtle shadow
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    // Store ground reference for later positioning
    const groundRef = ground;

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

        const meshMaterialDetails = [];

        model.traverse((obj) => {
          if (!obj.isMesh || !obj.material) return;
          
          // Enable shadows on all meshes for WhiteWall-style grounding
          obj.castShadow = true;
          obj.receiveShadow = false; // Model doesn't receive shadows, only ground does
          
          totalMeshes += 1;

          // Track mesh visibility
          const meshId = `mesh_${meshIdCounter++}`;
          const meshName = obj.name || `Mesh_${totalMeshes}`;
          const meshInfo = {
            id: meshId,
            name: meshName,
            visible: obj.visible,
            mesh: obj
          };
          meshList.push(meshInfo);

          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          totalMaterials += mats.length;

          mats.forEach((mat, matIndex) => {
            const t = mat?.type || "UnknownMaterial";
            byType[t] = (byType[t] || 0) + 1;
            
            const matName = mat.name || `Material_${matIndex}`;
            
            // Material properties
            const props = {
                transparent: mat.transparent,
                opacity: mat.opacity,
                roughness: mat.roughness,
              metalness: mat.metalness,
              clearcoat: mat.clearcoat,
              clearcoatRoughness: mat.clearcoatRoughness,
              envMapIntensity: mat.envMapIntensity,
            };
            
            // Texture maps
            const textureMaps = [];
            if (mat.map) textureMaps.push("map");
            if (mat.normalMap) textureMaps.push("normalMap");
            if (mat.roughnessMap) textureMaps.push("roughnessMap");
            if (mat.metalnessMap) textureMaps.push("metalnessMap");
            if (mat.aoMap) textureMaps.push("aoMap");
            if (mat.emissiveMap) textureMaps.push("emissiveMap");
            if (mat.alphaMap) textureMaps.push("alphaMap");
            if (mat.displacementMap) textureMaps.push("displacementMap");
            if (mat.bumpMap) textureMaps.push("bumpMap");
            
            // ============================================================
            // PROPER MATERIAL CLASSIFICATION
            // ============================================================
            const matNameLower = (matName || "").toLowerCase();
            const meshNameLower = meshName.toLowerCase();
            
            // Classify material type based on mesh and material names
            const isGlass = meshNameLower.includes("glass") || matNameLower.includes("glass");
            const isPrint = matNameLower.includes("art") || matNameLower.includes("print") || 
                           meshNameLower.includes("art") || meshNameLower.includes("back_art") ||
                           matNameLower.includes("back_art");
            const isAcrylicBody = matNameLower.includes("acrylic") || meshNameLower.includes("acrylic");
            const isFrame = meshNameLower.includes("frame") || meshNameLower.includes("metal") || 
                           matNameLower.includes("metal") || matNameLower.includes("frame");
            
            // CRITICAL FIX: Detect print candidates by checking for artwork map
            // If a material has a color map and it's not glass/frame, it's likely the print surface
            // In this GLB, Acrylic.001 is actually the print surface with artwork
            const hasArtworkMap = !!mat.map;
            const isPrintCandidate = hasArtworkMap && !isGlass && !isFrame;
            
            // Override: treat acrylic-with-map as PRINT for swapping (this model case)
            const finalIsPrint = isPrint || isPrintCandidate;
            
            // Determine material category
            let materialCategory = "UNKNOWN";
            if (isFrame) materialCategory = "FRAME";
            else if (isGlass) materialCategory = "GLASS";
            else if (finalIsPrint) materialCategory = "PRINT";
            else if (isAcrylicBody) materialCategory = "ACRYLIC";
            
            // Store for summary with proper classification
            meshMaterialDetails.push({
              meshName: meshName,
              meshId: meshId,
              materialIndex: matIndex,
              materialName: matName,
              materialType: t,
              materialClass: mat.constructor.name,
              materialCategory: materialCategory,
              properties: props,
              textureMaps: textureMaps,
              isFrame: isFrame,
              isGlass: isGlass,
              isPrint: finalIsPrint, // Use finalIsPrint
              isAcrylicBody: isAcrylicBody,
              hasArtworkMap: hasArtworkMap,
              isPrintCandidate: isPrintCandidate,
            });

            // ============================================================
            // APPLY CORRECT MATERIAL PROPERTIES BASED ON TYPE (MODEL-AGNOSTIC)
            // ============================================================
            // WhiteWall-style: Detect print layer by having map texture and not being glass/frame
            
            // 1) Front Print (any mesh with map texture that's not glass/frame) - Make it look like a print, NOT metal
            if (finalIsPrint) {
              if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
                // CRITICAL: Remove PBR maps that make artwork look dark/plastic
                // Only keep the artwork map (color texture)
                mat.normalMap = null;
                mat.roughnessMap = null;
                mat.metalnessMap = null;
                mat.aoMap = null;
                
                // Reset color to white (no tinting)
                mat.color.set(0xffffff);
                
                // Print material properties - WhiteWall vibrant, glossy look
                mat.transparent = false;
                mat.opacity = 1.0;
                mat.metalness = 0.0; // NOT metal (override bad GLB values)
                mat.roughness = 0.25; // Much glossier for vibrant WhiteWall look (was 0.45)
                mat.clearcoat = 0.3; // Subtle clearcoat for premium glossy print look
                mat.clearcoatRoughness = 0.2; // Smooth clearcoat
                
                if (envMapRef.current) {
                  mat.envMap = envMapRef.current;
                  mat.envMapIntensity = 0.5; // Higher reflection for vibrant contrast (was 0.25)
                }
                
                // Make sure artwork map is treated as sRGB (color-accurate)
                if (mat.map) {
                  mat.map.colorSpace = THREE.SRGBColorSpace;
                }
                
                mat.needsUpdate = true;
              }
              // Set render order: print draws first
              obj.renderOrder = 1;
            }
            // 2) Glass Cover (any mesh with "glass" in name) - Realistic acrylic using transmission
            else if (isGlass) {
              // Ensure we use Physical material for transmission
              let acrylicMat = mat;

              if (!mat.isMeshPhysicalMaterial) {
                acrylicMat = new THREE.MeshPhysicalMaterial();
                // Preserve existing maps if any
                if (mat.map) acrylicMat.map = mat.map;
                if (Array.isArray(obj.material)) {
                  obj.material[matIndex] = acrylicMat;
                } else {
                  obj.material = acrylicMat;
                }
              }

              // WhiteWall-style acrylic: transmission-based with tuned optical params
              // Override bad GLB values (opacity-based transparency) with proper transmission
              acrylicMat.color = new THREE.Color(0xffffff);
              acrylicMat.transparent = true;
              acrylicMat.transmission = 1.0; // Key: makes it transparent via refraction (not opacity)
              acrylicMat.opacity = 1.0; // Keep 1.0 when using transmission (override bad GLB opacity=0.17)
              acrylicMat.ior = 1.49; // Acrylic index of refraction
              acrylicMat.thickness = 0.001; // Thickness for refraction (adjust based on model scale)
              acrylicMat.roughness = 0.03; // WhiteWall is pretty "clean" (override bad GLB roughness=0)
              acrylicMat.metalness = 0.0;

              // Polished acrylic edge highlight
              acrylicMat.clearcoat = 1.0;
              acrylicMat.clearcoatRoughness = 0.03; // Sharper highlights

              // Attenuation for realistic acrylic transmission
              acrylicMat.attenuationColor = new THREE.Color(0xffffff);
              acrylicMat.attenuationDistance = 1.0;

              acrylicMat.depthWrite = false;
              acrylicMat.depthTest = true; // Explicit depth test for transparent stacking
              acrylicMat.side = THREE.DoubleSide; // Show both sides for thin plane

              if (envMapRef.current) {
                acrylicMat.envMap = envMapRef.current;
                acrylicMat.envMapIntensity = 2.5; // Stronger highlight for WhiteWall look
              }

              acrylicMat.needsUpdate = true;

              // Draw last (after print)
              obj.renderOrder = 10;
            }
            // 3) Back Mesh (Mesh → Back_Art_M) - Leave it alone (do nothing)
            else if (meshName === "Mesh" || meshName.toLowerCase().includes("back")) {
              // Lock the back - do nothing, keep original material properties
            }
            // 4) Frame/Metal - Keep metallic properties
            else if (isFrame) {
              if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
                mat.roughness = mat.roughness !== undefined ? Math.min(mat.roughness, 0.5) : 0.4;
                mat.metalness = mat.metalness !== undefined ? Math.max(mat.metalness, 0.6) : 0.7;
                if (envMapRef.current && !mat.envMap) {
                  mat.envMap = envMapRef.current;
                  mat.envMapIntensity = 1.0;
                  mat.needsUpdate = true;
                }
              }
            }
            // 5) Other meshes - Default to print-like (matte, opaque)
            else {
              if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
                mat.metalness = 0.0;
                mat.roughness = 0.85;
                mat.transparent = false;
                mat.opacity = 1.0;
                if (envMapRef.current && !mat.envMap) {
                  mat.envMap = envMapRef.current;
                  mat.envMapIntensity = 0.6;
                  mat.needsUpdate = true;
                }
              }
            }
            
            // ============================================================
            // TEXTURE LAYER DETECTION - ONLY MAP FOR ARTWORK (MODEL-AGNOSTIC)
            // ============================================================
            // CRITICAL: Only detect 'map' layers for artwork swapping
            // PBR maps (normal, roughness, metalness) should NOT be swappable
            // Detect print layer by: has map texture AND is not glass/frame
            // This works for any model without hardcoding mesh names
            if (mat.map && finalIsPrint) {
              const layerId = `layer_${layerIdCounter++}`;
              const layerInfo = {
                id: layerId,
                meshName: meshName,
                materialIndex: matIndex,
                mapType: "map", // Only map is swappable
                hasOriginal: true,
              material: mat,
                mesh: obj,
                materialCategory: materialCategory,
              };
              layers.push(layerInfo);
              // Store original texture
              originalTextures.set(layerId, mat.map);
            }
            });
          });

        setMaterialSummary({ totalMeshes, totalMaterials, byType });
        setTextureLayers(layers);
        originalTexturesRef.current = originalTextures;
        setMeshes(meshList);

        // ============================================================
        // COMPREHENSIVE MODEL ANALYSIS FOR WHITEWALL SETUP
        // ============================================================
        console.log("\n" + "=".repeat(80));
        console.log("🔍 COMPREHENSIVE GLB MODEL ANALYSIS FOR WHITEWALL SETUP");
        console.log("=".repeat(80));

        // 1) Mesh + Material Naming with Roles
        console.log("\n📋 1) MESH + MATERIAL NAMING (with roles)");
        console.log("-".repeat(80));
        meshMaterialDetails.forEach((detail, idx) => {
          console.log(`\n${idx + 1}. Mesh: "${detail.meshName}"`);
          console.log(`   Material: "${detail.materialName}"`);
          console.log(`   Type: ${detail.materialType} (${detail.materialClass})`);
          console.log(`   Category: ${detail.materialCategory}`);
          console.log(`   Has map: ${detail.hasArtworkMap ? "YES" : "NO"}`);
          const pbrMaps = detail.textureMaps.filter(m => m !== "map");
          console.log(`   PBR maps: ${pbrMaps.length > 0 ? pbrMaps.join(", ") : "none"}`);
          console.log(`   Properties: transparent=${detail.properties.transparent}, opacity=${detail.properties.opacity}, roughness=${detail.properties.roughness}, metalness=${detail.properties.metalness}`);
        });

        // 2) Which mesh is the "print surface"
        console.log("\n📋 2) PRINT SURFACE IDENTIFICATION");
        console.log("-".repeat(80));
        const printMeshes = meshMaterialDetails.filter(d => d.isPrint);
        if (printMeshes.length > 0) {
          console.log("✅ PRINT SURFACE MESHES (artwork UVs - swappable map):");
          printMeshes.forEach(d => {
            console.log(`   - "${d.meshName}" → "${d.materialName}" (has map: ${d.hasArtworkMap})`);
          });
        } else {
          console.log("⚠️  NO PRINT SURFACE DETECTED (no meshes with swappable map)");
        }

        // 3) Face orientation / sidedness
        console.log("\n📋 3) FACE ORIENTATION / SIDEDNESS");
        console.log("-".repeat(80));
        model.traverse((obj) => {
          if (!obj.isMesh || !obj.material) return;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((mat, idx) => {
            const side = mat.side === THREE.DoubleSide ? "DoubleSide" : 
                        mat.side === THREE.BackSide ? "BackSide" : "FrontSide";
            console.log(`   "${obj.name || 'Unnamed'}" → Material ${idx}: side=${side}`);
            
            // Check geometry for thickness/depth
            if (obj.geometry) {
              const pos = obj.geometry.attributes.position;
              if (pos) {
                const count = pos.count;
                const indices = obj.geometry.index;
                const triangleCount = indices ? indices.count / 3 : count / 3;
                
                // Estimate if it's a plane or solid by checking bounding box
                const geomBox = new THREE.Box3().setFromObject(obj);
                const geomSize = geomBox.getSize(new THREE.Vector3());
                const minDim = Math.min(geomSize.x, geomSize.y, geomSize.z);
                const maxDim = Math.max(geomSize.x, geomSize.y, geomSize.z);
                const thicknessRatio = minDim / maxDim;
                
                const isThin = thicknessRatio < 0.1;
                console.log(`      Geometry: ${count} vertices, ${triangleCount.toFixed(0)} triangles, ${obj.geometry.type}`);
                console.log(`      Bounding box: x=${geomSize.x.toFixed(3)}, y=${geomSize.y.toFixed(3)}, z=${geomSize.z.toFixed(3)}`);
                console.log(`      ${isThin ? "⚠️  THIN PLANE (single-sided likely)" : "✓ SOLID (closed mesh)"} (thickness ratio: ${thicknessRatio.toFixed(3)})`);
              }
            }
          });
        });

        // 4) Scale / Thickness Context
        console.log("\n📋 4) SCALE / THICKNESS CONTEXT");
        console.log("-".repeat(80));
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        console.log(`   Original bounding box size: x=${size.x.toFixed(3)}, y=${size.y.toFixed(3)}, z=${size.z.toFixed(3)}`);
        console.log(`   Center: x=${center.x.toFixed(3)}, y=${center.y.toFixed(3)}, z=${center.z.toFixed(3)}`);
        const originalMaxDim = Math.max(size.x, size.y, size.z);
        console.log(`   Max dimension: ${originalMaxDim.toFixed(3)}`);
        console.log(`   Scale factor will be: ${(2.5 / originalMaxDim).toFixed(3)}`);
        console.log(`   Estimated final size: ~${(originalMaxDim * (2.5 / originalMaxDim)).toFixed(3)} units`);

        // 5) UV Layout Expectations
        console.log("\n📋 5) UV LAYOUT EXPECTATIONS FOR SWAPPING");
        console.log("-".repeat(80));
        console.log(`   Total swappable texture layers: ${layers.length}`);
        layers.forEach((layer, idx) => {
          console.log(`   ${idx + 1}. Layer: "${layer.meshName}" → "${layer.mapType}"`);
          console.log(`      Material index: ${layer.materialIndex}`);
          console.log(`      Category: ${layer.materialCategory}`);
        });
        if (layers.length === 0) {
          console.log("   ⚠️  NO SWAPPABLE LAYERS FOUND (check if print meshes have 'map' texture)");
        }

        // 6) Current Renderer + Environment Setup
        console.log("\n📋 6) CURRENT RENDERER + ENVIRONMENT SETUP");
        console.log("-".repeat(80));
        console.log(`   Three.js version: ${THREE.REVISION}`);
        console.log(`   Tone mapping: ${renderer.toneMapping === THREE.ACESFilmicToneMapping ? "ACESFilmicToneMapping ✓" : "Other"}`);
        console.log(`   Tone mapping exposure: ${renderer.toneMappingExposure}`);
        console.log(`   Output color space: ${renderer.outputColorSpace === THREE.SRGBColorSpace ? "SRGBColorSpace ✓" : "Other"}`);
        console.log(`   Environment map: ${scene.environment ? "SET ✓" : "NOT SET"}`);
        console.log(`   HDRI path expected: "/assets/hdr/studio.hdr"`);
        console.log(`   HDRI format: .hdr (RGBE/Radiance)`);

        // 7) Material Properties Summary
        console.log("\n📋 7) CURRENT MATERIAL PROPERTIES (for WhiteWall look)");
        console.log("-".repeat(80));
        meshMaterialDetails.forEach((detail) => {
          console.log(`\n   "${detail.meshName}" → "${detail.materialName}" (${detail.materialCategory}):`);
          console.log(`      transparent: ${detail.properties.transparent ?? "N/A"}`);
          console.log(`      opacity: ${detail.properties.opacity ?? "N/A"}`);
          console.log(`      roughness: ${detail.properties.roughness ?? "N/A"}`);
          console.log(`      metalness: ${detail.properties.metalness ?? "N/A"}`);
          console.log(`      clearcoat: ${detail.properties.clearcoat ?? "N/A"}`);
          console.log(`      clearcoatRoughness: ${detail.properties.clearcoatRoughness ?? "N/A"}`);
          console.log(`      envMapIntensity: ${detail.properties.envMapIntensity ?? "N/A"}`);
        });

        // Toggle Test Instructions
        console.log("\n📋 TOGGLE TESTS (manual verification needed)");
        console.log("-".repeat(80));
        console.log("   Use the Mesh Visibility controls to test:");
        meshList.forEach((mesh, idx) => {
          console.log(`   ${idx + 1}. Hide "${mesh.name}" → Check what changes visually`);
        });
        console.log("\n   Expected results:");
        console.log("   - Hide PRINT mesh → artwork should disappear");
        console.log("   - Hide GLASS mesh → artwork should become clearer (less foggy)");
        console.log("   - Hide ACRYLIC mesh → check if it affects reflections/transparency");

        console.log("\n" + "=".repeat(80));
        console.log("✅ Analysis complete - use this info to configure WhiteWall material settings");
        console.log("=".repeat(80) + "\n");

        // Center and scale model
        
        model.position.sub(center);
        
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        model.scale.multiplyScalar(2.5 / maxDim);

        const scaledBox = new THREE.Box3().setFromObject(model);
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        model.position.sub(scaledCenter);
        
        const finalBox = new THREE.Box3().setFromObject(model);
        modelBoundingBoxRef.current = finalBox;

        // Auto-position ground plane at bottom of model bounding box
        const minY = finalBox.min.y;
        groundRef.position.y = minY - 0.002; // Tiny offset below model

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

  // Live lighting updates - WhiteWall-style
  useEffect(() => {
    if (!rendererRef.current || !lightsRef.current) return;

    const r = rendererRef.current;
    r.toneMappingExposure = lighting.exposure;

    const l = lightsRef.current;
    if (l.ambient) l.ambient.intensity = lighting.ambient;
    if (l.key) l.key.intensity = lighting.key;
    if (l.fill) l.fill.intensity = lighting.fill;
    if (l.rim) l.rim.intensity = lighting.rim;
  }, [lighting]);

  // Rotate the environment (HDRI) around Y (true HDRI rotation, not model rotation)
  useEffect(() => {
    if (!sceneRef.current) return;
    const yaw = THREE.MathUtils.degToRad(envRotation || 0);
    // three.js supports environmentRotation for IBL sampling direction
    sceneRef.current.environmentRotation = new THREE.Euler(0, yaw, 0);
  }, [envRotation]);

  // Toggle environment map (WhiteWall-style: always on by default)
  // CRITICAL: Respect per-mesh envMapIntensity values set during model loading
  useEffect(() => {
    if (!sceneRef.current || !envMapRef.current) return;

    sceneRef.current.environment = showReflections ? envMapRef.current : null;

    if (!modelRef.current) return;

    modelRef.current.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        if (!(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) return;

        // IMPORTANT:
        // Do NOT assign mat.envMap here.
        // Assigning per-material envMap overrides scene.environmentRotation, so HDR rotation won't affect reflections.
        // Keep envMap null and rely on scene.environment instead.
        mat.envMap = null;

        // DO NOT override envMapIntensity - respect per-mesh values set during model loading
        // Mesh_1 (print) = 0.15, glass001 (glass) = 2.0, others = 1.0
        const meshName = obj.name || "";
        if (meshName === "Mesh_1") {
          // Print: low reflection (updated to 0.15)
          mat.envMapIntensity = 0.15;
        } else if (meshName === "glass001" || meshName.toLowerCase() === "glass") {
          // Glass: high reflection (updated to 2.0 for WhiteWall look)
          mat.envMapIntensity = 2.5;
    } else {
          // Default: medium reflection
          const isFrame = meshName.toLowerCase().includes("frame") || meshName.toLowerCase().includes("metal");
          mat.envMapIntensity = isFrame ? 1.0 : 1.0;
        }

      mat.needsUpdate = true;
      });
    });
  }, [showReflections]);

  // Apply test texture to a specific layer
  const applyTestTextureToLayer = (layerId, textureNumber) => {
    const layer = textureLayers.find(l => l.id === layerId);
    if (!layer || !layer.material || !layer.mesh) {
      console.warn(`Layer ${layerId} not found or invalid`);
      return;
    }

    // CRITICAL FIX #1: Only allow swapping 'map' type
    if (layer.mapType !== "map") {
      console.warn(`Skipping ${layer.mapType} — only 'map' is swappable for artwork`);
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
    clonedTex.flipY = false; // IMPORTANT for glTF in many cases
    clonedTex.needsUpdate = true;

    // Apply ONLY to map (color/diffuse texture)
    mat.map = clonedTex;
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
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        // WhiteWall-style studio background:
        // soft vertical gradient + subtle radial falloff
        background: `
          radial-gradient(1200px 700px at 50% 40%,
            #f3f3f3 0%,
            #e3e0de 55%,
            #d2cdca 100%),
          linear-gradient(#cfc9c6 0%, #f6f6f6 65%, #ffffff 100%)
        `,
      }}
    >
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
              <div style={{ 
                marginBottom: 12, 
            padding: 8,
            background: "rgba(255,255,255,0.05)",
                borderRadius: 4,
                fontSize: 11,
                opacity: 0.8
              }}>
                WhiteWall-style: Studio HDRI environment + minimal lights
              </div>
              {[
                { key: "exposure", label: "Exposure", min: 0.5, max: 2.0, step: 0.01, desc: "ACES Filmic tone mapping" },
                { key: "ambient", label: "Ambient", min: 0, max: 0.5, step: 0.01, desc: "Very low (0.1-0.2 recommended)" },
                { key: "key", label: "Key Light", min: 0, max: 1.5, step: 0.01, desc: "Main directional light" },
                { key: "fill", label: "Fill Light", min: 0, max: 1.0, step: 0.01, desc: "Softens shadows" },
                { key: "rim", label: "Rim Light", min: 0, max: 1.0, step: 0.01, desc: "Edge highlight (keep subtle)" },
              ].map((s) => (
                <div key={s.key} style={{ marginBottom: 12 }}>
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
                  {s.desc && (
                    <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
                      {s.desc}
                    </div>
                  )}
                </div>
              ))}

              {/* Environment / lighting rotation slider (horizontal HDRI alignment) */}
              <div style={{ marginTop: 12 }}>
                <div
          style={{
            display: "flex",
                    justifyContent: "space-between",
            alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3 }}>
                    Lighting Rotation (Y)
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>
                    {envRotation.toFixed(0)}°
                  </span>
                </div>
          <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={envRotation}
                  onChange={(e) => setEnvRotation(parseFloat(e.target.value))}
                  style={{ width: "100%" }}
                />
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
                  Rotate the HDRI/environment horizontally (does not rotate the model)
                </div>
              </div>

              <button
                onClick={() => {
                  setLighting({
                    exposure: 1.30,
                    ambient: 0.05,
                    key: 0.45,
                    fill: 0.25,
                    rim: 0.35,
                  });
                  setEnvRotation(0);
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
                Reset to WhiteWall Preset
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
