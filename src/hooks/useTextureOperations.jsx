import * as THREE from "three";
import { MATERIAL_CONFIG, TEXTURE_CONFIG } from "../config/appConfig.jsx";
import { TextureManager } from "../managers/TextureManager.jsx";

/**
 * Custom hook for texture operations
 * Handles applying textures to layers and resetting to original
 */
export function useTextureOperations({
  textureLayersHook,
  materialType,
  textureManagerRef,
  sceneManagerRef,
  testTexture1Ref,
  testTexture2Ref,
}) {
  /**
   * Replace white pixels with metal color (delegates to TextureManager)
   */
  const replaceWhiteWithMetalColor = (image, metalColorType, threshold = 0.9) => {
    if (!textureManagerRef.current) return image;
    return textureManagerRef.current.replaceWhiteWithMetalColor(image, metalColorType, threshold);
  };

  /**
   * Apply test texture to a specific layer
   */
  const applyTestTextureToLayer = (layerId, textureNumber) => {
    const layer = textureLayersHook.textureLayers.find(l => l.id === layerId);
    if (!layer || !layer.mesh) {
      return;
    }

    // Only allow swapping 'map' type
    if (layer.mapType !== "map") {
      return;
    }

    // Get fresh reference to mesh
    const mesh = layer.mesh;
    if (!mesh || !mesh.material) {
      return;
    }

    const testTex = textureNumber === 1 ? testTexture1Ref.current : testTexture2Ref.current;
    if (!testTex) {
      return;
    }

    // Check if texture image is actually loaded
    if (!testTex.image || (testTex.image instanceof HTMLImageElement && !testTex.image.complete)) {
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
      return;
    }

    // Check if this is a metal, mirror, wood, or acrylic material
    const isMetal = materialType.activeMaterialTypeRef.current === "METAL" || materialType.activeMaterialTypeRef.current === "METAL_BOX";
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
        return;
      }
      
      // For metals: use original texture without any processing
      // Just swap the texture map, keep all PBR maps intact
      const clonedTex = textureManagerRef.current
        ? textureManagerRef.current.createTextureFromImage(testTex.image)
        : (() => {
            const tex = new THREE.Texture(testTex.image);
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
    } else if (isMirror) {
      // Allow Artwork_FullBleed, Artwork_Shrunk, and frames
      if (isFrame) {
        console.log('Applying texture to frame mesh:', layer.meshName);
      } else if (isFullBleed || isShrunk) {
        console.log('Applying texture to artwork mesh (mirror):', layer.meshName, 'Mesh type:', layer.meshType);
      } else {
        // Skip other mesh types for mirrors
        console.log(`Skipping texture application - only Artwork_FullBleed, Artwork_Shrunk, and frames allowed for mirrors. Mesh type: ${layer.meshType}, Mesh name: ${layer.meshName}`);
        return;
      }
      
      // For mirrors: use original texture without any processing
      // Just swap the texture map, keep all PBR maps intact
      const clonedTex = textureManagerRef.current
        ? textureManagerRef.current.createTextureFromImage(testTex.image)
        : (() => {
            const tex = new THREE.Texture(testTex.image);
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
        
        console.log(`Set matte properties for mirror artwork layer: "${layer.meshName}" (roughness: ${mat.roughness}, envMapIntensity: ${mat.envMapIntensity})`);
      }
      
      // Enable transparency for PNG textures (alpha channel support)
      mat.transparent = true;
      mat.opacity = 1.0;
      mat.alphaTest = 0.01; // Small alpha test to help with transparency
      mat.side = THREE.DoubleSide;
      mat.depthWrite = false; // Important for transparency rendering
      
      // Keep all original PBR maps (normalMap, roughnessMap, metalnessMap, etc.)
      // Don't modify material color or other properties
    } else {
      // For non-metals: apply texture without processing
      const originalTex = textureLayersHook.getOriginalTexture(layerId);
      
      // For acrylic: Composite white base with artwork texture
      let processedImage = testTex.image;
      
      if (isAcrylic && (isFullBleed || isShrunk)) {
        // Create a composite texture with white base and artwork on top
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: false });
        
        // Get exact image dimensions to avoid any scaling
        const img = testTex.image;
        let width, height;
        
        if (img instanceof HTMLImageElement) {
          // For images, use naturalWidth/naturalHeight for actual pixel dimensions
          // CRITICAL: Wait for image to be fully loaded to get accurate dimensions
          if (!img.complete || img.naturalWidth === 0) {
            console.warn('Image not fully loaded, using source image directly');
            processedImage = testTex.image;
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
          console.warn('Invalid image dimensions for acrylic composite, using source image directly');
          processedImage = testTex.image;
        } else {
          // Set canvas to exact image dimensions (no scaling)
          // CRITICAL: Set dimensions before getting context to avoid scaling issues
          canvas.width = width;
          canvas.height = height;
          
          // CRITICAL: Disable image smoothing for crisp, pixel-perfect rendering
          ctx.imageSmoothingEnabled = false;
          // Also disable for image pattern operations
          if (ctx.imageSmoothingQuality !== undefined) {
            ctx.imageSmoothingQuality = 'high';
          }
          // Ensure canvas uses optimal rendering settings
          ctx.textBaseline = 'top';
          ctx.textAlign = 'left';
          
          // Log composite size for debugging (helps identify NPOT issues)
          const isPOT = TextureManager.isPowerOfTwo(width) && TextureManager.isPowerOfTwo(height);
          console.log(`[AcrylicComposite] Canvas size: ${width}x${height}, POT: ${isPOT}`);
          
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
      
      // Create new texture from image using TextureManager
      // For acrylic artwork layers, ALWAYS use crisp settings for sharp textures
      const isAcrylicArtwork = isAcrylic && (isFullBleed || isShrunk);
      const useCrisp = isAcrylicArtwork; // Force crisp for acrylic artwork (ignore TEXTURE_CONFIG)
      
      const clonedTex = textureManagerRef.current
        ? textureManagerRef.current.createTextureFromImage(processedImage, {
            crisp: useCrisp,
            maxAnisotropy: TEXTURE_CONFIG.MAX_ANISOTROPY,
            useRepeatWrapping: true, // Use RepeatWrapping since we use offset/repeat UI
            premultiplyAlpha: true, // Prevent edge halos when compositing over white
          })
        : (() => {
            const tex = new THREE.Texture(processedImage);
            
            // Check if texture is power-of-two for mipmap decision
            const texWidth = processedImage?.naturalWidth || processedImage?.width || 0;
            const texHeight = processedImage?.naturalHeight || processedImage?.height || 0;
            const isPOT = texWidth > 0 && texHeight > 0 && 
                         TextureManager.isPowerOfTwo(texWidth) && 
                         TextureManager.isPowerOfTwo(texHeight);
            
            if (useCrisp) {
              // Crisp settings: only use mipmaps for power-of-two textures
              // NPOT textures with mipmaps can cause resampling/blur issues
              tex.generateMipmaps = isPOT;
              tex.minFilter = isPOT ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
              tex.magFilter = THREE.LinearFilter;
              tex.wrapS = THREE.RepeatWrapping;
              tex.wrapT = THREE.RepeatWrapping;
              tex.premultiplyAlpha = true; // Prevent edge halos when compositing over white
            } else {
              // Fast settings (backward compatible)
              tex.generateMipmaps = false;
              tex.minFilter = THREE.LinearFilter;
              tex.magFilter = THREE.LinearFilter;
              tex.wrapS = THREE.ClampToEdgeWrapping;
              tex.wrapT = THREE.ClampToEdgeWrapping;
              tex.premultiplyAlpha = false;
            }
            
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.needsUpdate = true;
            return tex;
          })();

      // Apply ONLY to map (color/diffuse texture)
      mat.map = clonedTex;
      
      // For acrylic artwork layers, ensure crisp texture settings are applied
      if (isAcrylicArtwork && mat.map) {
        // Always apply crisp settings for acrylic artwork (force crisp)
        // CRITICAL: Only enable mipmaps for power-of-two textures
        // NPOT textures with mipmaps can cause resampling/blur issues in WebGL
        const texWidth = mat.map.image?.naturalWidth || mat.map.image?.width || 0;
        const texHeight = mat.map.image?.naturalHeight || mat.map.image?.height || 0;
        const isPOT = texWidth > 0 && texHeight > 0 && 
                     TextureManager.isPowerOfTwo(texWidth) && 
                     TextureManager.isPowerOfTwo(texHeight);
        
        mat.map.generateMipmaps = isPOT;
        mat.map.minFilter = isPOT ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
        mat.map.magFilter = THREE.LinearFilter;
        // Use RepeatWrapping since we use offset/repeat UI
        mat.map.wrapS = THREE.RepeatWrapping;
        mat.map.wrapT = THREE.RepeatWrapping;
        // Premultiply alpha to prevent edge halos when compositing over white
        mat.map.premultiplyAlpha = true;
        // Set anisotropy if renderer is available
        const renderer = sceneManagerRef.current?.getRenderer();
        if (renderer?.capabilities) {
          mat.map.anisotropy = Math.min(
            TEXTURE_CONFIG.MAX_ANISOTROPY,
            renderer.capabilities.getMaxAnisotropy()
          );
        }
        // Don't force format/type - let Three.js decide based on source
        mat.map.needsUpdate = true;
      }
      
      // Mark material for update
      mat.needsUpdate = true;

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

      // Preserve original material properties
    }

    mat.needsUpdate = true;

    // Force renderer update
    const scene = sceneManagerRef.current?.getScene();
    const camera = sceneManagerRef.current?.getCamera();
    const renderer = sceneManagerRef.current?.getRenderer();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  };

  /**
   * Reset a layer to its original texture
   */
  const resetLayerToOriginal = (layerId) => {
    const layer = textureLayersHook.textureLayers.find(l => l.id === layerId);
    if (!layer || !layer.material || !layer.mesh) {
      return;
    }

    // Get fresh reference to mesh
    const mesh = layer.mesh;
    if (!mesh || !mesh.material) {
      return;
    }

    // Get the material (handle both single material and material arrays)
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const mat = mats[layer.materialIndex];
    if (!mat) {
      return;
    }

    const originalTex = textureLayersHook.getOriginalTexture(layerId);
    if (originalTex) {
      // Restore original texture
      mat[layer.mapType] = originalTex;
      
      // For mirror materials: also restore original material properties
      const isMirror = materialType.activeMaterialTypeRef.current === "MIRROR";
      const isFullBleed = layer.meshType === "fullBleed";
      const isShrunk = layer.meshType === "shrunk";
      
      if (isMirror && (isFullBleed || isShrunk)) {
        const restored = textureLayersHook.restoreOriginalMaterialProperties(layerId, mat);
        if (restored) {
          console.log(`Restored original material properties for mirror artwork layer: "${layer.meshName}"`);
        }
      }
      
      mat.needsUpdate = true;

      // Force renderer update
      const scene = sceneManagerRef.current?.getScene();
      const camera = sceneManagerRef.current?.getCamera();
      const renderer = sceneManagerRef.current?.getRenderer();
      if (renderer && scene && camera) {
        renderer.render(scene, camera);
      }
    }
  };

  return {
    applyTestTextureToLayer,
    resetLayerToOriginal,
    replaceWhiteWithMetalColor,
  };
}
