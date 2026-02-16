import { useState, useRef, useEffect } from "react";
import * as THREE from "three";
import { MATERIAL_CONFIG, MODEL_PATHS, TEXTURE_CONFIG } from "../config/appConfig.jsx";
import { TextureManager } from "../managers/TextureManager.jsx";
import { isMetalLocked } from "../materials/MetalMaterial.jsx";

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
 * @param {string[]} props.testTexturePaths - Array of test texture paths (default: ["/assets/frames/image4.png", "/assets/frames/Image5.png"])
 * @param {string[]} props.textureMapTypes - Array of texture map types to detect (default: common PBR maps)
 * @param {Array} props.textureLayers - Optional pre-detected texture layers (if provided, won't auto-detect)
 * @param {Function} props.onLayersDetected - Optional callback when layers are detected (receives layers array and originalTextures Map)
 * @param {Function} props.onLayerChange - Optional callback when a layer is changed (layerId, textureNumber, texture)
 * @param {Object} props.renderer - Optional renderer reference for forcing updates
 * @param {Object} props.scene - Optional scene reference for forcing updates
 * @param {Object} props.camera - Optional camera reference for forcing updates
 * @param {boolean} props.collapsible - Whether the UI should be collapsible (default: true)
 * @param {string} props.materialType - Optional material type (e.g., "ACRYLIC", "METAL") to determine PBR preservation behavior
 * @param {Object} props.textureManager - Optional TextureManager instance for better white color removal (same as metals use)
 * @param {Object} props.style - Optional custom styles for the container
 */
export default function TextureLayerManager({
  model,
  textureLoader,
  testTexturePaths = ["/assets/frames/image4.png", "/assets/frames/Image5.png"],
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
  materialType = null,
  textureManager = null,
  meshCache = null, // Optional MeshCache for optimized lookups
  style = {}
}) {
  const [textureLayers, setTextureLayers] = useState(externalTextureLayers || []);
  const [showLayers, setShowLayers] = useState(!collapsible);
  // Track texture offsets and repeat for each layer
  const [textureOffsets, setTextureOffsets] = useState(new Map());
  const [textureRepeats, setTextureRepeats] = useState(new Map());
  const [loading, setLoading] = useState(!externalTextureLayers);
  
  const originalTexturesRef = useRef(new Map());
  const originalMaterialPropertiesRef = useRef(new Map()); // Map<layerId, originalMaterialProperties>
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
        // CRITICAL FIX #2: Only detect 'map' layers for artwork editing
        // PBR maps (normal, roughness, metalness) should NOT be swappable
        const mapType = "map";
        if (mat[mapType]) {
          const layerId = `layer_${layerIdCounter++}`;
          const layerInfo = {
            id: layerId,
            meshName: obj.name || "Unnamed",
            materialIndex: matIndex,
            mapType: mapType, // Only map is swappable
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

    // Clear old textures before loading new ones
    testTexturesRef.current.forEach(tex => {
      if (tex && tex.dispose) {
        try {
          tex.dispose();
        } catch (e) {
          // Error disposing old test texture
        }
      }
    });
    
    testTexturesRef.current = [];
    let loadedCount = 0;
    const totalTextures = testTexturePaths.length;

    testTexturePaths.forEach((path, index) => {
      loaderRef.current.load(
        path,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          testTexturesRef.current[index] = texture;
          loadedCount++;
          // console.log(`✓ Successfully loaded texture ${index + 1}: ${path}`);
        },
        undefined,
        (error) => {
          // Failed to load texture
          if (process.env.NODE_ENV === 'development') {
            console.error(`✗ Failed to load texture ${index + 1}: ${path}`, error);
          }
          testTexturesRef.current[index] = null;
          loadedCount++;
        }
      );
    });
    }, [model, testTexturePaths]);

  // Helper function to make specific color pixels transparent for metal materials
  // This removes specified color areas so the metal material underneath shows through
  // @param image - The image to process
  // @param metalColorType - Metal color type (for backward compatibility, not used for color removal)
  // @param threshold - Brightness threshold (0-1) for white removal (default: 0.9)
  // @param colorToRemove - Optional: Specific color to remove as {r, g, b} (0-255) or hex string (e.g., "#ffffff"). Set to null to disable color removal.
  // @param colorTolerance - Tolerance for color matching (0-255, default: 10)
  // @param enableColorRemoval - If false, skips all color removal processing and returns original image (default: true)
  const replaceWhiteWithMetalColor = (image, metalColorType, threshold = 0.9, colorToRemove = null, colorTolerance = 10, enableColorRemoval = true) => {
    // If color removal is disabled, return original image
    if (!enableColorRemoval) {
      return image;
    }
    const canvas = document.createElement('canvas');
    canvas.width = image.width || image.naturalWidth;
    canvas.height = image.height || image.naturalHeight;
    // Optimize: Use willReadFrequently only when needed, enable desynchronized for better performance
    const ctx = canvas.getContext('2d', { 
      willReadFrequently: true, // Needed for getImageData
      alpha: true,
      desynchronized: true // Allow async rendering
    });
    
    // Enable image smoothing for better quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Clear canvas to ensure no old data persists
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw the image onto canvas
    ctx.drawImage(image, 0, 0);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Parse colorToRemove if provided
    let targetColor = null;
    if (colorToRemove) {
      if (typeof colorToRemove === 'string') {
        // Hex string like "#ffffff" or "ffffff"
        const hex = colorToRemove.replace('#', '');
        targetColor = {
          r: parseInt(hex.substring(0, 2), 16),
          g: parseInt(hex.substring(2, 4), 16),
          b: parseInt(hex.substring(4, 6), 16)
        };
      } else if (typeof colorToRemove === 'object' && colorToRemove.r !== undefined) {
        // Object with r, g, b properties
        targetColor = {
          r: Math.round(colorToRemove.r),
          g: Math.round(colorToRemove.g),
          b: Math.round(colorToRemove.b)
        };
      }
    }
    
    // Optimize: Use chunked processing for large images to avoid blocking
    const pixelCount = canvas.width * canvas.height;
    const LARGE_IMAGE_THRESHOLD = 1000000; // 1MP (1000x1000)
    const CHUNK_SIZE = 50000; // Process 50k pixels per chunk
    
    if (pixelCount > LARGE_IMAGE_THRESHOLD) {
      // Large image: Use chunked async processing
      return new Promise((resolve) => {
        let pixelIndex = 0;
        const totalPixels = pixelCount;
        
        const processChunk = (deadline) => {
          const endIndex = Math.min(pixelIndex + CHUNK_SIZE, totalPixels);
          
          for (let p = pixelIndex; p < endIndex; p++) {
            const i = p * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            let shouldRemove = false;
            
            if (targetColor) {
              const rDiff = Math.abs(r - targetColor.r);
              const gDiff = Math.abs(g - targetColor.g);
              const bDiff = Math.abs(b - targetColor.b);
              
              if (rDiff <= colorTolerance && gDiff <= colorTolerance && bDiff <= colorTolerance) {
                shouldRemove = true;
              }
            } else {
              const brightness = (r + g + b) / (3 * 255);
              if (brightness >= threshold) {
                shouldRemove = true;
              }
            }
            
            if (shouldRemove) {
              data[i + 3] = 0;
            }
          }
          
          pixelIndex = endIndex;
          
          if (pixelIndex < totalPixels) {
            // Continue processing if we have time, otherwise yield
            if (deadline && deadline.timeRemaining() > 0) {
              processChunk(deadline);
            } else {
              // Yield to browser, continue in next idle period
              if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(processChunk, { timeout: 100 });
              } else {
                setTimeout(() => processChunk({ timeRemaining: () => 5 }), 0);
              }
            }
          } else {
            // Finished processing all pixels
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas);
          }
        };
        
        // Start processing
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(processChunk, { timeout: 2000 });
        } else {
          setTimeout(() => processChunk({ timeRemaining: () => Infinity }), 0);
        }
      });
    } else {
      // Small image: Process synchronously (fast enough)
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        let shouldRemove = false;
        
        if (targetColor) {
          const rDiff = Math.abs(r - targetColor.r);
          const gDiff = Math.abs(g - targetColor.g);
          const bDiff = Math.abs(b - targetColor.b);
          
          if (rDiff <= colorTolerance && gDiff <= colorTolerance && bDiff <= colorTolerance) {
            shouldRemove = true;
          }
        } else {
          const brightness = (r + g + b) / (3 * 255);
          if (brightness >= threshold) {
            shouldRemove = true;
          }
        }
        
        if (shouldRemove) {
          data[i + 3] = 0;
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      return canvas;
    }
  };

  /**
   * Create an emissive mask that only lights up near-white, low-saturation pixels.
   * This is used for acrylic prints to get a “super-white paper” look without
   * washing out colored regions of the artwork.
   *
   * @param {HTMLCanvasElement} sourceCanvas - The composite canvas (white base + artwork)
   * @param {number} whiteThreshold - Luminance threshold (0–1) above which pixels are considered white-ish
   * @param {number} saturationMax - Maximum saturation (0–1) for a pixel to be considered “neutral” (non-colored)
   */
  const createWhiteEmissiveMaskCanvas = (sourceCanvas, whiteThreshold = 0.92, saturationMax = 0.18) => {
    if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) {
      return Promise.resolve(null);
    }

    const w = sourceCanvas.width;
    const h = sourceCanvas.height;

    const mask = document.createElement("canvas");
    mask.width = w;
    mask.height = h;

    // Optimize: Use willReadFrequently only when needed, enable desynchronized for better performance
    const ctx = sourceCanvas.getContext("2d", { 
      willReadFrequently: true, // Needed for getImageData
      desynchronized: true 
    });
    const mctx = mask.getContext("2d", { 
      willReadFrequently: true, // Needed for createImageData
      desynchronized: true 
    });

    if (!ctx || !mctx) {
      return Promise.resolve(null);
    }

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    const out = mctx.createImageData(w, h);
    const o = out.data;

    // Optimize: Use chunked processing for large images to avoid blocking
    const pixelCount = w * h;
    const LARGE_IMAGE_THRESHOLD = 1000000; // 1MP (1000x1000)
    const CHUNK_SIZE = 50000; // Process 50k pixels per chunk
    
    if (pixelCount > LARGE_IMAGE_THRESHOLD) {
      // Large image: Use chunked async processing
      return new Promise((resolve) => {
        let pixelIndex = 0;
        
        const processChunk = (deadline) => {
          const endIndex = Math.min(pixelIndex + CHUNK_SIZE, pixelCount);
          
          for (let p = pixelIndex; p < endIndex; p++) {
            const i = p * 4;
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;
            const a = data[i + 3] / 255;

            // Luminance in linear-ish space
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

            // Simple saturation approximation
            const maxv = Math.max(r, g, b);
            const minv = Math.min(r, g, b);
            const sat = maxv === 0 ? 0 : (maxv - minv) / maxv;

            // Only treat pixels as "paper white" if:
            // - Visible (alpha not ~0)
            // - Bright enough
            // - Low saturation (i.e. neutral, not colored)
            const isWhite = a > 0.001 && lum >= whiteThreshold && sat <= saturationMax;

            const v = isWhite ? 255 : 0;
            o[i] = v;       // R
            o[i + 1] = v;   // G
            o[i + 2] = v;   // B
            o[i + 3] = 255; // A (opaque mask)
          }
          
          pixelIndex = endIndex;
          
          if (pixelIndex < pixelCount) {
            // Continue processing if we have time, otherwise yield
            if (deadline && deadline.timeRemaining() > 0) {
              processChunk(deadline);
            } else {
              // Yield to browser, continue in next idle period
              if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(processChunk, { timeout: 100 });
              } else {
                setTimeout(() => processChunk({ timeRemaining: () => 5 }), 0);
              }
            }
          } else {
            // Finished processing all pixels
            mctx.putImageData(out, 0, 0);
            resolve(mask);
          }
        };
        
        // Start processing
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(processChunk, { timeout: 2000 });
        } else {
          setTimeout(() => processChunk({ timeRemaining: () => Infinity }), 0);
        }
      });
    } else {
      // Small image: Process synchronously (fast enough)
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;
        const a = data[i + 3] / 255;

        // Luminance in linear-ish space
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        // Simple saturation approximation
        const maxv = Math.max(r, g, b);
        const minv = Math.min(r, g, b);
        const sat = maxv === 0 ? 0 : (maxv - minv) / maxv;

        // Only treat pixels as "paper white" if:
        // - Visible (alpha not ~0)
        // - Bright enough
        // - Low saturation (i.e. neutral, not colored)
        const isWhite = a > 0.001 && lum >= whiteThreshold && sat <= saturationMax;

        const v = isWhite ? 255 : 0;
        o[i] = v;       // R
        o[i + 1] = v;   // G
        o[i + 2] = v;   // B
        o[i + 3] = 255; // A (opaque mask)
      }

      mctx.putImageData(out, 0, 0);
      return Promise.resolve(mask);
    }
  };

  // Apply test texture to a specific layer
  const applyTestTextureToLayer = (layerId, textureNumber) => {
    const layer = textureLayers.find(l => l.id === layerId);
    if (!layer) {
      return;
    }
    
    if (!layer.material || !layer.mesh) {
      return;
    }

    // CRITICAL FIX #1: Only allow swapping 'map' type
    if (layer.mapType !== "map") {
      return;
    }

    // Get fresh reference to mesh
    const mesh = layer.mesh;
    if (!mesh || !mesh.material) {
      return;
    }

    const testTex = testTexturesRef.current[textureNumber - 1];
    if (!testTex) {
      return;
    }

    // Extract actual image from texture
    let sourceImage = testTex.image;
    if (!sourceImage && testTex.source) {
      sourceImage = testTex.source.data;
    }
    
    // Check if texture image is actually loaded
    if (!sourceImage) {
      // Try to reload the texture
      const path = testTexturePaths[textureNumber - 1];
      if (path) {
        loaderRef.current.load(
          path,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            testTexturesRef.current[textureNumber - 1] = texture;
            // Retry applying texture
            setTimeout(() => applyTestTextureToLayer(layerId, textureNumber), 100);
          },
          undefined,
          (error) => {
            // Failed to reload texture
            if (process.env.NODE_ENV === 'development') {
              console.error(`✗ Failed to reload texture: ${path}`, error);
            }
          }
        );
      }
      return;
    }

    // Check if image is loaded (for HTMLImageElement)
    if (sourceImage instanceof HTMLImageElement && !sourceImage.complete) {
      // Wait for texture to load
      sourceImage.onload = () => {
        // Retry after image loads
        setTimeout(() => applyTestTextureToLayer(layerId, textureNumber), 100);
      };
      sourceImage.onerror = (error) => {
        // Failed to load image
        if (process.env.NODE_ENV === 'development') {
          console.error(`✗ Image failed to load: ${sourceImage.src || 'unknown'}`, error);
        }
      };
      return;
    }

    // Check if image is a canvas and has valid dimensions
    if (sourceImage instanceof HTMLCanvasElement) {
      if (sourceImage.width === 0 || sourceImage.height === 0) {
        return;
      }
    }

    // Get the material (handle both single material and material arrays)
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const mat = mats[layer.materialIndex];
    if (!mat) {
      return;
    }
    
    // Verify material is still valid
    if (!mat.isMaterial) {
      return;
    }

    // For metals and mirrors, apply texture to Artwork_FullBleed and Artwork_Shrunk (like acrylic)
    // No white color removal - using PNGs now
    const isMetal = materialType === "METAL" || materialType === "METAL_BOX";
    const isMirror = materialType === "MIRROR";
    const isWood = materialType === "WOOD";
    const isAcrylic = materialType === "ACRYLIC";
    const isFullBleed = layer.meshType === "fullBleed";
    const isShrunk = layer.meshType === "shrunk";
    const isFrame = layer.meshType === "frame";
    
    if (isMetal) {
      // Allow Artwork_FullBleed, Artwork_Shrunk, and frames
      if (!isFrame && !isFullBleed && !isShrunk) {
        // Skip other mesh types for metals
        return;
      }
    }
    
    if (isMirror) {
      // Allow Artwork_FullBleed, Artwork_Shrunk, and frames
      if (!isFrame && !isFullBleed && !isShrunk) {
        // Skip other mesh types for mirrors
        return;
      }
    }

    // Get fresh material reference before any operations
    // This ensures we're working with the actual material on the mesh
    const matsFresh = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const finalMat = matsFresh[layer.materialIndex];
    
    if (!finalMat) {
      return;
    }
    
    // For acrylic: Composite white base with artwork texture
    let processedImage = sourceImage;
    
    if (isAcrylic && (isFullBleed || isShrunk)) {
      // Create a composite texture with white base and artwork on top
      // Optimized: Use willReadFrequently: false for better performance
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { 
        willReadFrequently: false, // Optimize for write operations
        alpha: true,
        desynchronized: true // Allow async rendering
      });
      
      // Get exact image dimensions to avoid any scaling
      const img = sourceImage;
      let width, height;
      
      if (img instanceof HTMLImageElement) {
        // For images, use naturalWidth/naturalHeight for actual pixel dimensions
        // CRITICAL: Wait for image to be fully loaded to get accurate dimensions
        if (!img.complete || img.naturalWidth === 0) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Image not fully loaded, using source image directly');
          }
          processedImage = sourceImage;
        } else {
          width = img.naturalWidth;
          height = img.naturalHeight;
        }
      } else if (img instanceof HTMLCanvasElement) {
        // For canvas, use exact dimensions
        width = img.width;
        height = img.height;
      } else {
        // Fallback (shouldn't happen, but handle gracefully)
        width = img.width || 2048;
        height = img.height || 2048;
      }
      
      // Ensure we have valid dimensions
      if (!width || !height || width <= 0 || height <= 0) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Invalid image dimensions for acrylic composite, using source image directly');
        }
        processedImage = sourceImage;
      } else {
        // Set canvas to exact image dimensions (no scaling)
        // CRITICAL: Set dimensions before getting context to avoid scaling issues
        canvas.width = width;
        canvas.height = height;
        
        // Check if texture is power-of-two (helps identify NPOT issues)
        const isPOT = TextureManager.isPowerOfTwo(width) && TextureManager.isPowerOfTwo(height);
        
        // CRITICAL: Disable image smoothing for crisp, pixel-perfect rendering
        ctx.imageSmoothingEnabled = false;
        // Also disable for image pattern operations
        if (ctx.imageSmoothingQuality !== undefined) {
          ctx.imageSmoothingQuality = 'high';
        }
        // Ensure canvas uses optimal rendering settings
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        
        // CRITICAL: Clear canvas first to ensure clean starting state
        ctx.clearRect(0, 0, width, height);
        
        // Draw white background first
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        
        // CRITICAL: Draw artwork without explicit dimensions to avoid any scaling
        // If dimensions match exactly, drawImage without width/height preserves pixels perfectly
        if (img instanceof HTMLImageElement && img.naturalWidth === width && img.naturalHeight === height) {
          // Draw without dimensions - preserves pixel-perfect rendering
          ctx.drawImage(img, 0, 0);
        } else {
          // For canvas or mismatched dimensions, use explicit dimensions
          ctx.drawImage(img, 0, 0, width, height);
        }
        
        processedImage = canvas;
      }
    }

    // For acrylic artwork layers, build an emissive mask that only boosts
    // near-white "paper" regions instead of the whole artwork.
    if (isAcrylic && (isFullBleed || isShrunk) && processedImage) {
      if (processedImage instanceof HTMLCanvasElement) {
        const maskCanvasResult = createWhiteEmissiveMaskCanvas(processedImage, 0.92, 0.18);
        
        // Handle async result (always returns Promise now for consistency)
        const handleMaskCanvas = (maskCanvas) => {
          if (maskCanvas && (finalMat.isMeshStandardMaterial || finalMat.isMeshPhysicalMaterial)) {
            let emissiveTex;
            try {
              if (textureManager && textureManager.createTextureFromImage) {
                emissiveTex = textureManager.createTextureFromImage(maskCanvas, {
                  flipY: false,
                });
              } else {
                emissiveTex = new THREE.Texture(maskCanvas);
                emissiveTex.wrapS = THREE.ClampToEdgeWrapping;
                emissiveTex.wrapT = THREE.ClampToEdgeWrapping;
                emissiveTex.generateMipmaps = false;
                emissiveTex.minFilter = THREE.LinearFilter;
                emissiveTex.magFilter = THREE.LinearFilter;
                emissiveTex.flipY = false;
                emissiveTex.needsUpdate = true;
              }

              if (emissiveTex) {
                finalMat.emissive = new THREE.Color(0xffffff);
                finalMat.emissiveMap = emissiveTex;
                // Lower intensity for more natural look (prevents flattening and glass glow)
                // Range 1-5 is more physically safe than 20
                finalMat.emissiveIntensity = 3.0;
                // Keep tone mapping so global exposure still behaves correctly
                finalMat.toneMapped = true;
                // Ensure emissive map uses SRGB color space
                emissiveTex.colorSpace = THREE.SRGBColorSpace;
              }
            } catch (e) {
              // If emissive mask creation fails, fall back gracefully with no emissive boost
            }
          }
        };

        maskCanvasResult.then(handleMaskCanvas).catch(() => {
          // If mask creation fails, continue without emissive boost
        });
      }
    }
    
    // Dispose old texture to prevent remnants (but only if it's not the original)
    const originalTex = originalTexturesRef.current.get(layerId);
    const currentTex = finalMat.map;
    
    // Always allow swapping - dispose current texture if it exists and is not the original
    if (currentTex && currentTex !== originalTex) {
      try {
        // Check if texture is still valid before disposing
        if (currentTex.dispose && typeof currentTex.dispose === 'function') {
          currentTex.dispose();
        }
      } catch (e) {
        // Error disposing old texture
      }
      // Clear reference immediately to prevent stale references
      finalMat.map = null;
    } else if (currentTex === originalTex) {
      // If current texture IS the original, we can still swap - just clear the reference
      finalMat.map = null;
    }

    // PRESERVE ALL PBR MAPS - Don't remove anything from the original model
    // Keep all original PBR properties intact (normalMap, roughnessMap, metalnessMap, aoMap, emissiveMap)
    // This ensures the original model's material properties are never modified

    // Validate processed image before creating texture
    if (!processedImage) {
      return;
    }
    
    // Validate image dimensions
    if (processedImage instanceof HTMLCanvasElement) {
      if (processedImage.width === 0 || processedImage.height === 0) {
        return;
      }
    } else if (processedImage instanceof HTMLImageElement) {
      if (!processedImage.complete || processedImage.naturalWidth === 0) {
        return;
      }
    }
    
    // Create new texture from image
    // For acrylic artwork layers, ALWAYS use crisp settings for sharp textures
    const isAcrylicArtwork = isAcrylic && (isFullBleed || isShrunk);
    const useCrisp = isAcrylicArtwork; // Force crisp for acrylic artwork (ignore TEXTURE_CONFIG)
    
    let clonedTex;
    try {
      // Use TextureManager to create texture if available
          if (textureManager && textureManager.createTextureFromImage) {
        clonedTex = textureManager.createTextureFromImage(processedImage, {
          flipY: false,
          crisp: useCrisp,
          maxAnisotropy: TEXTURE_CONFIG.MAX_ANISOTROPY,
          useRepeatWrapping: true, // Use RepeatWrapping since we use offset/repeat UI
          premultiplyAlpha: true, // Prevent edge halos when compositing over white
        });
      } else {
        // Fallback: create texture directly
        clonedTex = new THREE.Texture(processedImage);
        clonedTex.wrapS = THREE.ClampToEdgeWrapping;
        clonedTex.wrapT = THREE.ClampToEdgeWrapping;
        
        // Check if texture is power-of-two for mipmap decision
        const texWidth = processedImage?.naturalWidth || processedImage?.width || 0;
        const texHeight = processedImage?.naturalHeight || processedImage?.height || 0;
        const isPOT = texWidth > 0 && texHeight > 0 && 
                     TextureManager.isPowerOfTwo(texWidth) && 
                     TextureManager.isPowerOfTwo(texHeight);
        
        if (useCrisp) {
          // Crisp settings: only use mipmaps for power-of-two textures
          // NPOT textures with mipmaps can cause resampling/blur issues
          clonedTex.generateMipmaps = isPOT;
          clonedTex.minFilter = isPOT ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
          clonedTex.magFilter = THREE.LinearFilter;
          // Use RepeatWrapping since we use offset/repeat UI
          clonedTex.wrapS = THREE.RepeatWrapping;
          clonedTex.wrapT = THREE.RepeatWrapping;
          // Premultiply alpha to prevent edge halos when compositing over white
          clonedTex.premultiplyAlpha = true;
          // Note: anisotropy requires renderer, so we'll set it later if possible
        } else {
          // Fast settings (backward compatible)
          clonedTex.generateMipmaps = false;
          clonedTex.minFilter = THREE.LinearFilter;
          clonedTex.magFilter = THREE.LinearFilter;
          clonedTex.wrapS = THREE.ClampToEdgeWrapping;
          clonedTex.wrapT = THREE.ClampToEdgeWrapping;
          clonedTex.premultiplyAlpha = false;
        }
        
        clonedTex.colorSpace = THREE.SRGBColorSpace;
        clonedTex.flipY = false;
        clonedTex.needsUpdate = true;
      }
      
      // Ensure the image is valid
      if (!clonedTex || !clonedTex.image) {
        return;
      }
    } catch (e) {
      return;
    }

    // Apply ONLY to map (color/diffuse texture)
    // finalMat is already the fresh material reference from above
    finalMat.map = clonedTex;
    
    // For acrylic artwork layers, ensure crisp texture settings are applied
    if (isAcrylicArtwork && finalMat.map) {
      // Always apply crisp settings for acrylic artwork (force crisp)
      // CRITICAL: Only enable mipmaps for power-of-two textures
      // NPOT textures with mipmaps can cause resampling/blur issues in WebGL
      const texWidth = finalMat.map.image?.naturalWidth || finalMat.map.image?.width || 0;
      const texHeight = finalMat.map.image?.naturalHeight || finalMat.map.image?.height || 0;
      const isPOT = texWidth > 0 && texHeight > 0 && 
                   TextureManager.isPowerOfTwo(texWidth) && 
                   TextureManager.isPowerOfTwo(texHeight);
      
      finalMat.map.generateMipmaps = isPOT;
      finalMat.map.minFilter = isPOT ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      finalMat.map.magFilter = THREE.LinearFilter;
      // Use RepeatWrapping since we use offset/repeat UI
      finalMat.map.wrapS = THREE.RepeatWrapping;
      finalMat.map.wrapT = THREE.RepeatWrapping;
      // Premultiply alpha to prevent edge halos when compositing over white
      finalMat.map.premultiplyAlpha = true;
      // Set anisotropy if renderer is available
      if (renderer?.capabilities) {
        finalMat.map.anisotropy = Math.min(
          TEXTURE_CONFIG.MAX_ANISOTROPY,
          renderer.capabilities.getMaxAnisotropy()
        );
      }
      // Don't force format/type - let Three.js decide based on source
      // This prevents unintended conversions and gamma issues
      finalMat.map.needsUpdate = true;
    }
    
    // Mark material for update
    finalMat.needsUpdate = true;
    
    // For metals: Copy brushed metal finish from corresponding metal background mesh
    if (isMetal && (isFullBleed || isShrunk)) {
      // Use MeshCache for optimized lookups (eliminates model traversal)
      let metalMatForColor = null; // Always from FullBleed for color consistency
      let metalMatForMaps = null;  // From corresponding mesh (fullBleed or shrunk)
      const meshNameLower = (layer.meshName || "").toLowerCase();
      
      // Use cache if available, otherwise fall back to traversal (backward compatible)
      if (meshCache && !meshCache.isEmpty()) {
        // Detect metal type from cache
        const detectedMetalType = meshCache.detectMetalType();
        const isSilver = detectedMetalType === "silver" || (detectedMetalType === null && (materialType === "METAL" || meshNameLower.includes("silver")));
        const isWhite = detectedMetalType === "white" || (detectedMetalType === null && (materialType === "METAL_BOX" || meshNameLower.includes("white")));
        
        const metalType = isSilver ? "silver" : (isWhite ? "white" : null);
        if (metalType) {
          metalMatForColor = meshCache.getMetalMaterialForColor(metalType);
          metalMatForMaps = meshCache.getMetalMaterialForMaps(metalType, isFullBleed);
        }
      } else {
        // Fallback: traverse model (backward compatible when cache not available)
        let detectedMetalType = null;
        model.traverse((obj) => {
          if (obj.isMesh && obj.name) {
            const objNameLower = obj.name.toLowerCase();
            if (objNameLower.includes("silver") && (objNameLower.includes("fullbleed") || objNameLower.includes("shrunk"))) {
              detectedMetalType = "silver";
            } else if (objNameLower.includes("white") && objNameLower.includes("metal") && (objNameLower.includes("fullbleed") || objNameLower.includes("shrunk"))) {
              detectedMetalType = "white";
            }
          }
        });
        
        const isSilver = detectedMetalType === "silver" || (detectedMetalType === null && (materialType === "METAL" || meshNameLower.includes("silver")));
        const isWhite = detectedMetalType === "white" || (detectedMetalType === null && (materialType === "METAL_BOX" || meshNameLower.includes("white")));
        
        model.traverse((obj) => {
          if (obj.isMesh && obj.material) {
            const objNameLower = (obj.name || "").toLowerCase();
            
            if (!metalMatForColor) {
              let shouldMatchFullBleed = false;
              if (isSilver) {
                shouldMatchFullBleed = objNameLower.includes("silver") && 
                                     (objNameLower.includes("fullbleed") || objNameLower.includes("full_bleed")) &&
                                     !objNameLower.includes("artwork");
              } else if (isWhite) {
                shouldMatchFullBleed = objNameLower.includes("white") && 
                                     (objNameLower.includes("fullbleed") || objNameLower.includes("full_bleed")) &&
                                     !objNameLower.includes("artwork");
              }
              
              if (shouldMatchFullBleed) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach((mat) => {
                  if (mat.metalness !== undefined && mat.metalness > 0.4) {
                    metalMatForColor = mat;
                  }
                });
              }
            }
            
            if (!metalMatForMaps) {
              let shouldMatch = false;
              if (isFullBleed) {
                if (isSilver) {
                  shouldMatch = objNameLower.includes("silver") && 
                               (objNameLower.includes("fullbleed") || objNameLower.includes("full_bleed")) &&
                               !objNameLower.includes("artwork");
                } else if (isWhite) {
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
                  shouldMatch = objNameLower.includes("white") && 
                               (objNameLower.includes("shrunk") || objNameLower.includes("shrink")) &&
                               !objNameLower.includes("artwork");
                }
              }
              
              if (shouldMatch) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach((mat) => {
                  if (mat.metalness !== undefined && mat.metalness > 0.4) {
                    metalMatForMaps = mat;
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
            finalMat.normalMap = metalMatForMaps.normalMap;
            if (finalMat.normalScale && metalMatForMaps.normalScale) {
              finalMat.normalScale.copy(metalMatForMaps.normalScale);
            }
          }
          if (metalMatForMaps.roughnessMap) {
            finalMat.roughnessMap = metalMatForMaps.roughnessMap;
          }
          if (metalMatForMaps.metalnessMap) {
            finalMat.metalnessMap = metalMatForMaps.metalnessMap;
          }
          if (metalMatForMaps.aoMap) {
            finalMat.aoMap = metalMatForMaps.aoMap;
            if (metalMatForMaps.aoMapIntensity !== undefined) {
              finalMat.aoMapIntensity = metalMatForMaps.aoMapIntensity;
            }
          }
          if (metalMatForMaps.emissiveMap) {
            finalMat.emissiveMap = metalMatForMaps.emissiveMap;
          }
          
          // Set material properties for metallic brushed finish
          finalMat.metalness = 1.0; // Make it metallic
          // Use frame's roughness (should be 1.0 from centralized preset), fallback to 1.0 if not set
          finalMat.roughness = metalMatForMaps.roughness !== undefined ? metalMatForMaps.roughness : 1.0;
          
          // CRITICAL: For locked metal materials, DO NOT modify envMapIntensity or specularIntensity
          // These are controlled by MetalMaterial.applyMetalState() - the single source of truth
          if (!isMetalLocked(finalMat)) {
            // Only modify if NOT locked to metal system
            // Copy environment map (but NOT intensity - let applyMetalState own intensity)
            if (metalMatForMaps.envMap) {
              finalMat.envMap = metalMatForMaps.envMap;
            }
            // DO NOT set envMapIntensity here - let MetalMaterial.applyMetalState() control it
            
            // Disable all specular and clearcoat properties to prevent light reflections and shininess
            if (finalMat.specularIntensity !== undefined) finalMat.specularIntensity = 0.0;
          } else {
            // Material is locked to metal system - only copy maps, don't modify PBR properties
            if (metalMatForMaps.envMap) {
              finalMat.envMap = metalMatForMaps.envMap;
            }
            // DO NOT modify envMapIntensity, specularIntensity, or any other PBR properties
          }
          if (finalMat.clearcoat !== undefined) finalMat.clearcoat = 0.0;
          if (finalMat.clearcoatRoughness !== undefined) finalMat.clearcoatRoughness = 1.0;
          if (finalMat.sheen !== undefined) finalMat.sheen = 0.0;
          if (finalMat.sheenRoughness !== undefined) finalMat.sheenRoughness = 1.0;
        }
        
        // ALWAYS copy color from FullBleed mesh (ensures consistency between fullBleed and shrunk)
        if (metalMatForColor && metalMatForColor.color) {
          finalMat.color.copy(metalMatForColor.color);
        } else if (metalMatForMaps && metalMatForMaps.color) {
          // Fallback: use color from corresponding mesh if FullBleed not found
          finalMat.color.copy(metalMatForMaps.color);
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`Metal background material not found for ${layer.meshName} (isFullBleed: ${isFullBleed}, isShrunk: ${isShrunk})`);
        }
        // Fallback: Set metal properties even if frame material not found
        // CRITICAL: For locked metal materials, DO NOT modify envMapIntensity or specularIntensity
        if (!isMetalLocked(finalMat)) {
          // Only modify if NOT locked to metal system
          finalMat.metalness = 1.0;
          finalMat.roughness = 1.0; // Maximum roughness - completely matte, no shininess
          // DO NOT set envMapIntensity here - let MetalMaterial.applyMetalState() control it
          // Disable all specular and clearcoat properties
          if (finalMat.specularIntensity !== undefined) finalMat.specularIntensity = 0.0;
        } else {
          // Material is locked - only set basic properties, don't modify PBR
          finalMat.metalness = 1.0;
          finalMat.roughness = 1.0;
          // DO NOT modify envMapIntensity, specularIntensity, or any other PBR properties
        }
        if (finalMat.clearcoat !== undefined) finalMat.clearcoat = 0.0;
        if (finalMat.clearcoatRoughness !== undefined) finalMat.clearcoatRoughness = 1.0;
        if (finalMat.sheen !== undefined) finalMat.sheen = 0.0;
        if (finalMat.sheenRoughness !== undefined) finalMat.sheenRoughness = 1.0;
      }
      
      // Apply minimal transparency settings (matching working test app)
      finalMat.transparent = true;
      finalMat.opacity = 1.0;
      finalMat.alphaTest = 0.001; // Very small alpha test (matches working app)
      finalMat.depthWrite = true; // Proper depth rendering (matches working app)
      // Don't set side property - let material use its original setting
    }
    
    // For mirrors: Set artwork layer to matte with minimal reflection (don't copy mirror's reflective properties)
    if (isMirror && (isFullBleed || isShrunk)) {
      // Store original material properties BEFORE modifying them (for reset functionality)
      if (!originalMaterialPropertiesRef.current.has(layerId)) {
        originalMaterialPropertiesRef.current.set(layerId, {
          roughness: finalMat.roughness,
          metalness: finalMat.metalness,
          envMapIntensity: finalMat.envMapIntensity,
          transparent: finalMat.transparent,
          opacity: finalMat.opacity,
          alphaTest: finalMat.alphaTest,
          side: finalMat.side,
          depthWrite: finalMat.depthWrite,
          normalMap: finalMat.normalMap,
          roughnessMap: finalMat.roughnessMap,
          metalnessMap: finalMat.metalnessMap,
          clearcoatMap: finalMat.clearcoatMap,
          clearcoatNormalMap: finalMat.clearcoatNormalMap,
          clearcoatRoughnessMap: finalMat.clearcoatRoughnessMap,
          sheenColorMap: finalMat.sheenColorMap,
          sheenRoughnessMap: finalMat.sheenRoughnessMap,
        });
      }
      
      // Remove any reflection-related maps
      finalMat.normalMap = null;
      finalMat.roughnessMap = null;
      finalMat.metalnessMap = null;
      finalMat.clearcoatMap = null;
      finalMat.clearcoatNormalMap = null;
      finalMat.clearcoatRoughnessMap = null;
      finalMat.sheenColorMap = null;
      finalMat.sheenRoughnessMap = null;
      
      // Set matte properties: high roughness (matte), low metalness, minimal reflection
      finalMat.roughness = 0.95; // Very matte (high roughness = less reflective)
      finalMat.metalness = 0.0; // Non-metallic
      finalMat.envMapIntensity = 0.1; // Very low environment map intensity (minimal reflection)
      
      // Enable transparency for PNG textures (alpha channel support)
      finalMat.transparent = true;
      finalMat.opacity = 1.0;
      finalMat.alphaTest = 0.01; // Small alpha test to help with transparency
      finalMat.side = THREE.DoubleSide;
      finalMat.depthWrite = false; // Important for transparency rendering
      
      finalMat.needsUpdate = true;
    }
    
    // For wood: Copy wood texture properties from corresponding wood background mesh
    if (isWood && (isFullBleed || isShrunk)) {
      // Use MeshCache for optimized lookups (eliminates model traversal)
      let woodMatForColor = null; // Always from FullBleed for color consistency
      let woodMatForMaps = null;  // From corresponding mesh (fullBleed or shrunk)
      
      // Use cache if available, otherwise fall back to traversal (backward compatible)
      if (meshCache && !meshCache.isEmpty()) {
        woodMatForColor = meshCache.getWoodMaterialForColor();
        woodMatForMaps = meshCache.getWoodMaterialForMaps(isFullBleed);
      } else {
        // Fallback: traverse model (backward compatible when cache not available)
        model.traverse((obj) => {
          if (obj.isMesh && obj.material) {
            const objNameLower = (obj.name || "").toLowerCase();
            
            if (!woodMatForColor) {
              const shouldMatchFullBleed = objNameLower.includes("wood") && 
                                          (objNameLower.includes("fullbleed") || objNameLower.includes("full_bleed"));
              
              if (shouldMatchFullBleed) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach((mat) => {
                  if (!mat.map || (mat.map && !objNameLower.includes("artwork"))) {
                    woodMatForColor = mat;
                  }
                });
              }
            }
            
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
                mats.forEach((mat) => {
                  if (!mat.map || (mat.map && !objNameLower.includes("artwork"))) {
                    woodMatForMaps = mat;
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
            finalMat.normalMap = woodMatForMaps.normalMap;
            if (finalMat.normalScale && woodMatForMaps.normalScale) {
              finalMat.normalScale.copy(woodMatForMaps.normalScale);
            }
          }
          if (woodMatForMaps.roughnessMap) {
            finalMat.roughnessMap = woodMatForMaps.roughnessMap;
          }
          if (woodMatForMaps.metalnessMap) {
            finalMat.metalnessMap = woodMatForMaps.metalnessMap;
          }
          if (woodMatForMaps.aoMap) {
            finalMat.aoMap = woodMatForMaps.aoMap;
            if (woodMatForMaps.aoMapIntensity !== undefined) {
              finalMat.aoMapIntensity = woodMatForMaps.aoMapIntensity;
            }
          }
          if (woodMatForMaps.emissiveMap) {
            finalMat.emissiveMap = woodMatForMaps.emissiveMap;
          }
          
          // Copy material properties for wood finish
          if (woodMatForMaps.roughness !== undefined) {
            finalMat.roughness = woodMatForMaps.roughness;
          }
          if (woodMatForMaps.metalness !== undefined) {
            finalMat.metalness = woodMatForMaps.metalness;
          }
          
          // Copy environment map and intensity for reflections
          if (woodMatForMaps.envMap) {
            finalMat.envMap = woodMatForMaps.envMap;
          }
          if (woodMatForMaps.envMapIntensity !== undefined) {
            finalMat.envMapIntensity = woodMatForMaps.envMapIntensity;
          }
        }
        
        // ALWAYS copy color from FullBleed mesh (ensures consistency between fullBleed and shrunk)
        if (woodMatForColor && woodMatForColor.color) {
          finalMat.color.copy(woodMatForColor.color);
        } else if (woodMatForMaps && woodMatForMaps.color) {
          // Fallback: use color from corresponding mesh if FullBleed not found
          finalMat.color.copy(woodMatForMaps.color);
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`Wood background material not found for ${layer.meshName} (isFullBleed: ${isFullBleed}, isShrunk: ${isShrunk})`);
        }
      }
      
      // Apply minimal transparency settings (matching working test app, same as metals)
      finalMat.transparent = true;
      finalMat.opacity = 1.0;
      finalMat.alphaTest = 0.001; // Very small alpha test (matches working app)
      finalMat.depthWrite = true; // Proper depth rendering (matches working app)
      // Don't set side property - let material use its original setting
    }
    
    // PRESERVE ALL ORIGINAL MATERIAL PROPERTIES
    // Don't modify transparent, alphaTest, opacity, or color (except for acrylic as above)
    // Keep all original model material properties intact
    
    // Use finalMat (fresh reference) for all updates
    finalMat.needsUpdate = true;

    // Force material to update all properties
    if (finalMat.map) {
      finalMat.map.needsUpdate = true;
    }

    // Animation loop handles rendering automatically - no need for manual render

    // Call callback if provided
    if (onLayerChange) {
      try {
        onLayerChange(layerId, textureNumber, clonedTex);
      } catch (e) {
        // Error in onLayerChange callback
      }
    }
  };

  // Reset a layer to its original texture
  const resetLayerToOriginal = (layerId) => {
    const layer = textureLayers.find(l => l.id === layerId);
    if (!layer || !layer.material || !layer.mesh) {
      return;
    }

    // Get fresh reference to mesh
    const mesh = layer.mesh;
    if (!mesh || !mesh.material) {
      return;
    }

    // Get the material
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const mat = mats[layer.materialIndex];
    if (!mat) {
      return;
    }

    const originalTex = originalTexturesRef.current.get(layerId);
    if (originalTex) {
      // Restore original texture
      mat[layer.mapType] = originalTex;
      
      // For mirror materials: also restore original material properties
      const isMirror = materialType === "MIRROR";
      const isFullBleed = layer.meshType === "fullBleed";
      const isShrunk = layer.meshType === "shrunk";
      
      if (isMirror && (isFullBleed || isShrunk)) {
        const originalProps = originalMaterialPropertiesRef.current.get(layerId);
        if (originalProps) {
          // CRITICAL: For locked metal materials, DO NOT restore PBR properties
          // MetalMaterial.applyMetalState() is the single source of truth for metal materials
          const isLocked = isMetalLocked(mat);
          
          // Restore all material properties (skip PBR for locked metals)
          if (!isLocked) {
            if (originalProps.roughness !== undefined) mat.roughness = originalProps.roughness;
            if (originalProps.metalness !== undefined) mat.metalness = originalProps.metalness;
            if (originalProps.envMapIntensity !== undefined) mat.envMapIntensity = originalProps.envMapIntensity;
          }
          // Always restore transparency/opacity settings (safe for all materials)
          if (originalProps.transparent !== undefined) mat.transparent = originalProps.transparent;
          if (originalProps.opacity !== undefined) mat.opacity = originalProps.opacity;
          if (originalProps.alphaTest !== undefined) mat.alphaTest = originalProps.alphaTest;
          if (originalProps.side !== undefined) mat.side = originalProps.side;
          if (originalProps.depthWrite !== undefined) mat.depthWrite = originalProps.depthWrite;
          
          // Restore maps
          if (originalProps.normalMap !== undefined) mat.normalMap = originalProps.normalMap;
          if (originalProps.roughnessMap !== undefined) mat.roughnessMap = originalProps.roughnessMap;
          if (originalProps.metalnessMap !== undefined) mat.metalnessMap = originalProps.metalnessMap;
          if (originalProps.clearcoatMap !== undefined) mat.clearcoatMap = originalProps.clearcoatMap;
          if (originalProps.clearcoatNormalMap !== undefined) mat.clearcoatNormalMap = originalProps.clearcoatNormalMap;
          if (originalProps.clearcoatRoughnessMap !== undefined) mat.clearcoatRoughnessMap = originalProps.clearcoatRoughnessMap;
          if (originalProps.sheenColorMap !== undefined) mat.sheenColorMap = originalProps.sheenColorMap;
          if (originalProps.sheenRoughnessMap !== undefined) mat.sheenRoughnessMap = originalProps.sheenRoughnessMap;
        }
      }
      
      mat.needsUpdate = true;
      // Animation loop handles rendering automatically - no need for manual render

      // Call callback if provided
      if (onLayerChange) {
        onLayerChange(layerId, null, originalTex);
      }
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 10, color: "white", fontSize: 12, ...style }}>
        Loading texture layers...
      </div>
    );
  }

  // Filter texture layers to only show Artwork_FullBleed, Artwork_Shrunk, and Frame_Edge
  const filteredTextureLayers = textureLayers.filter((layer) => {
    const meshName = (layer.meshName || "").toLowerCase();
    const meshType = layer.meshType;
    
    // Show Artwork_FullBleed (by name or type)
    const isArtworkFullBleed = (meshName.includes("artwork") && 
                               (meshName.includes("fullbleed") || meshName.includes("full_bleed"))) ||
                               meshType === "fullBleed";
    
    // Show Artwork_Shrunk (by name or type)
    const isArtworkShrunk = (meshName.includes("artwork") && 
                           (meshName.includes("shrunk") || meshName.includes("shrink"))) ||
                           meshType === "shrunk";
    
    // Show Frame_Edge (by name or type)
    const isFrameEdge = (meshName.includes("frame") && meshName.includes("edge")) ||
                       meshType === "frame";
    
    return isArtworkFullBleed || isArtworkShrunk || isFrameEdge;
  });

  if (filteredTextureLayers.length === 0) {
    return (
      <div style={{ padding: 10, color: "white", fontSize: 12, opacity: 0.7, ...style }}>
        No texture layers found (Artwork_FullBleed, Artwork_Shrunk, or Frame_Edge)
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
          <span>Texture Layers ({filteredTextureLayers.length})</span>
          <span>{showLayers ? "−" : "+"}</span>
        </button>
      )}

      {showLayers && (
        <div style={{ marginTop: collapsible ? 10 : 0, maxHeight: "400px", overflowY: "auto", paddingRight: 4 }}>
          {filteredTextureLayers.map((layer) => (
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
              
              {/* Texture Controls Section */}
              {layer.mapType === "map" && (
                <div style={{ marginBottom: 10, width: "100%", boxSizing: "border-box" }}>
                  {/* Texture Position Controls */}
                  <div style={{ marginBottom: 8, padding: 10, background: "rgba(0,0,0,0.25)", borderRadius: 5, border: "1px solid rgba(255,255,255,0.1)", width: "100%", boxSizing: "border-box" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 8, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Position
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, width: "100%" }}>
                      <label style={{ fontSize: 9, width: 20, color: "#ccc", fontWeight: 600, flexShrink: 0 }}>X:</label>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
                        <input
                          type="range"
                          min="-1"
                          max="1"
                          step="0.01"
                          value={textureOffsets.get(layer.id)?.x || 0}
                          onChange={(e) => {
                            const newX = parseFloat(e.target.value);
                            setTextureOffsets(prev => {
                              const newMap = new Map(prev);
                              const current = newMap.get(layer.id) || { x: 0, y: 0 };
                              newMap.set(layer.id, { ...current, x: newX });
                              return newMap;
                            });
                            // Apply offset to texture
                            const mesh = layer.mesh;
                            if (mesh && mesh.material) {
                              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                              const mat = mats[layer.materialIndex];
                              if (mat && mat.map) {
                                mat.map.offset.x = newX;
                                mat.map.needsUpdate = true;
                                mat.needsUpdate = true;
                                // Animation loop handles rendering automatically
                              }
                            }
                          }}
                          style={{ 
                            width: "100%",
                            cursor: "pointer",
                            margin: 0,
                            padding: 0,
                            outline: "none",
                            WebkitAppearance: "none",
                            appearance: "none",
                            background: "transparent"
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 9, width: 40, textAlign: "right", color: "#fff", fontFamily: "monospace", fontWeight: 600, flexShrink: 0 }}>
                        {(textureOffsets.get(layer.id)?.x || 0).toFixed(2)}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, width: "100%" }}>
                      <label style={{ fontSize: 9, width: 20, color: "#ccc", fontWeight: 600, flexShrink: 0 }}>Y:</label>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
                        <input
                          type="range"
                          min="-1"
                          max="1"
                          step="0.01"
                          value={textureOffsets.get(layer.id)?.y || 0}
                          onChange={(e) => {
                            const newY = parseFloat(e.target.value);
                            setTextureOffsets(prev => {
                              const newMap = new Map(prev);
                              const current = newMap.get(layer.id) || { x: 0, y: 0 };
                              newMap.set(layer.id, { ...current, y: newY });
                              return newMap;
                            });
                            // Apply offset to texture
                            const mesh = layer.mesh;
                            if (mesh && mesh.material) {
                              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                              const mat = mats[layer.materialIndex];
                              if (mat && mat.map) {
                                mat.map.offset.y = newY;
                                mat.map.needsUpdate = true;
                                mat.needsUpdate = true;
                                // Animation loop handles rendering automatically
                              }
                            }
                          }}
                          style={{ 
                            width: "100%",
                            cursor: "pointer",
                            margin: 0,
                            padding: 0,
                            outline: "none",
                            WebkitAppearance: "none",
                            appearance: "none",
                            background: "transparent"
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 9, width: 40, textAlign: "right", color: "#fff", fontFamily: "monospace", fontWeight: 600, flexShrink: 0 }}>
                        {(textureOffsets.get(layer.id)?.y || 0).toFixed(2)}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setTextureOffsets(prev => {
                          const newMap = new Map(prev);
                          newMap.set(layer.id, { x: 0, y: 0 });
                          return newMap;
                        });
                        // Reset offset
                        const mesh = layer.mesh;
                        if (mesh && mesh.material) {
                          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                          const mat = mats[layer.materialIndex];
                          if (mat && mat.map) {
                            mat.map.offset.set(0, 0);
                            mat.map.needsUpdate = true;
                            mat.needsUpdate = true;
                            // Animation loop handles rendering automatically
                          }
                        }
                      }}
                      style={{
                        width: "100%",
                        padding: "6px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: 4,
                        background: "rgba(255,255,255,0.1)",
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: 9,
                        fontWeight: 600,
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = "rgba(255,255,255,0.2)";
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = "rgba(255,255,255,0.1)";
                      }}
                    >
                      Reset Position
                    </button>
                  </div>
                  
                  {/* Horizontal Scale Controls */}
                  <div style={{ padding: 10, background: "rgba(0,0,0,0.25)", borderRadius: 5, border: "1px solid rgba(255,255,255,0.1)", width: "100%", boxSizing: "border-box" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 8, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Horizontal Scale
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, width: "100%" }}>
                      <label style={{ fontSize: 9, width: 20, color: "#ccc", fontWeight: 600, flexShrink: 0 }}>X:</label>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
                        <input
                          type="range"
                          min="0.1"
                          max="3"
                          step="0.01"
                          value={textureRepeats.get(layer.id)?.x || 1}
                          onChange={(e) => {
                            const newX = parseFloat(e.target.value);
                            setTextureRepeats(prev => {
                              const newMap = new Map(prev);
                              const current = newMap.get(layer.id) || { x: 1, y: 1 };
                              newMap.set(layer.id, { ...current, x: newX });
                              return newMap;
                            });
                            // Apply repeat to texture - X controls horizontal stretching
                            const mesh = layer.mesh;
                            if (mesh && mesh.material) {
                              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                              const mat = mats[layer.materialIndex];
                              if (mat && mat.map) {
                                const currentRepeat = textureRepeats.get(layer.id) || { x: 1, y: 1 };
                                mat.map.repeat.set(newX, currentRepeat.y);
                                mat.map.needsUpdate = true;
                                mat.needsUpdate = true;
                                // Animation loop handles rendering automatically
                              }
                            }
                          }}
                          style={{ 
                            width: "100%",
                            cursor: "pointer",
                            margin: 0,
                            padding: 0,
                            outline: "none",
                            WebkitAppearance: "none",
                            appearance: "none",
                            background: "transparent"
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 9, width: 40, textAlign: "right", color: "#fff", fontFamily: "monospace", fontWeight: 600, flexShrink: 0 }}>
                        {(textureRepeats.get(layer.id)?.x || 1).toFixed(2)}
                      </span>
                    </div>
                    <div style={{ fontSize: 8, color: "#aaa", marginTop: 4, lineHeight: "1.3" }}>
                      <span style={{ color: "#4CAF50" }}>Lower</span> = less stretching • <span style={{ color: "#FF9800" }}>Higher</span> = more stretching
                    </div>
                  </div>
                </div>
              )}
              
              <div style={{ display: "flex", gap: 6 }}>
                {(() => {
                  // Filter test textures based on layer type
                  // Frame_Edge layers ONLY get the frame texture
                  // Other layers get regular test textures (excluding frame texture)
                  const isFrameEdge = (layer.meshName || "").includes("Frame_Edge");
                  const frameTexturePath = MODEL_PATHS?.TEST_IMAGES?.FRAME_TEXTURE;
                  
                  // Get available textures for this layer
                  const availableTextures = testTexturePaths.filter((path, index) => {
                    // If it's Frame_Edge, ONLY show the frame texture
                    if (isFrameEdge) return path === frameTexturePath;
                    // For other layers, exclude the frame texture
                    return path !== frameTexturePath;
                  });
                  
                  // Map to original indices for proper texture application
                  return availableTextures.map((path) => {
                    const originalIndex = testTexturePaths.indexOf(path);
                    const textureNumber = originalIndex + 1;
                    const isFrameTexture = path === frameTexturePath;
                    
                    return (
                      <button
                        key={originalIndex}
                        onClick={() => applyTestTextureToLayer(layer.id, textureNumber)}
                        style={{
                          flex: 1,
                          padding: 6,
                          border: 0,
                          borderRadius: 4,
                          background: isFrameTexture ? "#9C27B0" : (originalIndex === 0 ? "#4CAF50" : "#2196F3"),
                          color: "white",
                          cursor: "pointer",
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        {isFrameTexture ? "Frame" : `Test ${originalIndex + 1}`}
                      </button>
                    );
                  });
                })()}
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
