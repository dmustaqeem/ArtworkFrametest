import { useState, useRef, useEffect } from "react";
import * as THREE from "three";

/**
 * TextureTransformModal Component
 *
 * A modal component for visually transforming textures (crop, scale, rotate).
 * The selection box is fixed, and the image transforms behind it.
 * Only the portion inside the dashed selection box is applied to the model.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Callback when modal closes
 * @param {Array} props.textureLayers - Array of texture layer objects with { id, mesh, materialIndex, mapType }
 * @param {THREE.TextureLoader} props.textureLoader - Texture loader instance
 * @param {THREE.WebGLRenderer} props.renderer - Renderer instance (for anisotropy)
 * @param {string[]} props.testTexturePaths - Fallback texture paths (default: ["/assets/frames/image4.png", "/assets/frames/Image5.png"])
 */
export default function TextureTransformModal({
  isOpen,
  onClose,
  textureLayers = [],
  textureLoader,
  renderer,
  testTexturePaths = ["/assets/frames/image4.png", "/assets/frames/Image5.png"],
  meshes = [], // Pass meshes to determine visibility
  allTextureLayers = [], // Pass all texture layers (unfiltered) to apply correctly
}) {
  // Transform state
  const [textureTransform, setTextureTransform] = useState({
    translateX: 0,   // px in canvas coords (image center position)
    translateY: 0,    // px in canvas coords (image center position)
    scaleX: 1,        // 1 = baseline fit
    scaleY: 1,
    rotationDeg: 0,   // rotation around image center
  });

  // Refs
  const baseScaleRef = useRef(1); // Initial fit scale
  const imageRef = useRef(null); // The source image element
  const canvasRef = useRef(null); // Preview canvas
  const selectionRectRef = useRef({ x: 0, y: 0, width: 0, height: 0 }); // Fixed selection box
  const lastAppliedTransformRef = useRef(null); // Store last applied transform to restore on reopen
  const originalSourceImageRef = useRef(null); // Store the original source image URL/data for restoration
  const testTexture1Ref = useRef(null);
  const testTexture2Ref = useRef(null);
  const isInitializedRef = useRef(false); // Track if modal has been initialized to prevent re-initialization

  // Mouse interaction state
  const [isDragging, setIsDragging] = useState(null);
  const isDraggingRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0, transform: null });
  
  // Keep ref in sync with state
  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  // Load test textures for fallback
  useEffect(() => {
    if (!textureLoader) return;

    const loader = textureLoader || new THREE.TextureLoader();
    
    // Load test texture 1
    loader.load(
      testTexturePaths[0],
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        testTexture1Ref.current = tex;
      },
      undefined,
      () => {}
    );

    // Load test texture 2
    if (testTexturePaths[1]) {
      loader.load(
        testTexturePaths[1],
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          testTexture2Ref.current = tex;
        },
        undefined,
        () => {}
      );
    }
  }, [textureLoader, testTexturePaths]);

  // Initialize texture transform: fit entire image inside DASHED BOX
  const initializeTextureTransform = (img, canvasWidth, canvasHeight) => {
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    const imgAspect = imgW / imgH;
    const canvasAspect = canvasWidth / canvasHeight;

    // Size factor: make boxes and image smaller (60% of canvas) to provide more space
    const sizeFactor = 0.6;
    const padding = canvasWidth * 0.01; // 1% padding

    // Calculate DASHED BOX size to fit image tightly
    let dashedW, dashedH;

    if (imgAspect > canvasAspect) {
      // Image is wider than canvas aspect - fit to canvas width with size factor
      dashedW = (canvasWidth - (padding * 2)) * sizeFactor;
      dashedH = dashedW / imgAspect;

      // If height exceeds canvas, fit to height instead
      if (dashedH > (canvasHeight - (padding * 2)) * sizeFactor) {
        dashedH = (canvasHeight - (padding * 2)) * sizeFactor;
        dashedW = dashedH * imgAspect;
      }
    } else {
      // Image is taller than canvas aspect - fit to canvas height with size factor
      dashedH = (canvasHeight - (padding * 2)) * sizeFactor;
      dashedW = dashedH * imgAspect;

      // If width exceeds canvas, fit to width instead
      if (dashedW > (canvasWidth - (padding * 2)) * sizeFactor) {
        dashedW = (canvasWidth - (padding * 2)) * sizeFactor;
        dashedH = dashedW / imgAspect;
      }
    }

    // Calculate SOLID BOX size: 125% of dashed box (so dashed box is 80% of solid box)
    const solidW = dashedW / 0.8;
    const solidH = dashedH / 0.8;

    // Center solid box in canvas
    const solidX = (canvasWidth - solidW) / 2;
    const solidY = (canvasHeight - solidH) / 2;

    // Store solid box (selectionRectRef) - this is the outer box
    selectionRectRef.current = { x: solidX, y: solidY, width: solidW, height: solidH };

    // Compute fit scale: entire image must fit inside DASHED BOX
    const fitScale = Math.min(dashedW / imgW, dashedH / imgH);
    baseScaleRef.current = fitScale;

    // Center image in DASHED BOX (which is centered in solid box)
    const dashedX = solidX + solidW * 0.1;  // 10% inset from solid box
    const dashedY = solidY + solidH * 0.1;
    const imageCenterX = dashedX + dashedW / 2;
    const imageCenterY = dashedY + dashedH / 2;

    setTextureTransform({
      translateX: imageCenterX,
      translateY: imageCenterY,
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
    });
  };

  // Render transformed image on canvas
  const renderTextureTransform = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !img.complete) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw checkerboard background
    const checkerSize = 20;
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#1a1a1a';
    for (let y = 0; y < height; y += checkerSize) {
      for (let x = 0; x < width; x += checkerSize) {
        if ((x / checkerSize + y / checkerSize) % 2 === 0) {
          ctx.fillRect(x, y, checkerSize, checkerSize);
        }
      }
    }

    // Draw transformed image
    ctx.save();

    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    const renderScaleX = baseScaleRef.current * textureTransform.scaleX;
    const renderScaleY = baseScaleRef.current * textureTransform.scaleY;

    // Transform: translate to image center, rotate, scale, then draw centered
    ctx.translate(textureTransform.translateX, textureTransform.translateY);
    ctx.rotate((textureTransform.rotationDeg * Math.PI) / 180);
    ctx.scale(renderScaleX, renderScaleY);
    ctx.drawImage(img, -imgW / 2, -imgH / 2);

    ctx.restore();

    // Draw fixed dashed selection box overlay
    const sel = selectionRectRef.current;
    ctx.strokeStyle = '#00CED1';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(sel.x, sel.y, sel.width, sel.height);

    // Draw inner dashed rectangle (80% of selection box)
    const innerX = sel.x + sel.width * 0.1;
    const innerY = sel.y + sel.height * 0.1;
    const innerW = sel.width * 0.8;
    const innerH = sel.height * 0.8;
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;
    ctx.strokeRect(innerX, innerY, innerW, innerH);
    ctx.setLineDash([]);

    // Draw dark overlay outside selection box
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.rect(sel.x, sel.y, sel.width, sel.height);
    ctx.fill('evenodd');

    // Draw corner handles
    const handleSize = 12;
    ctx.fillStyle = '#00CED1';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    const corners = [
      { x: sel.x, y: sel.y },
      { x: sel.x + sel.width, y: sel.y },
      { x: sel.x, y: sel.y + sel.height },
      { x: sel.x + sel.width, y: sel.y + sel.height },
    ];
    corners.forEach((corner) => {
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, handleSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Draw edge handles
    const edgeHandleSize = 8;
    const edges = [
      { x: sel.x + sel.width / 2, y: sel.y, w: sel.width, h: edgeHandleSize },
      { x: sel.x + sel.width / 2, y: sel.y + sel.height, w: sel.width, h: edgeHandleSize },
      { x: sel.x, y: sel.y + sel.height / 2, w: edgeHandleSize, h: sel.height },
      { x: sel.x + sel.width, y: sel.y + sel.height / 2, w: edgeHandleSize, h: sel.height },
    ];
    edges.forEach((edge) => {
      ctx.fillRect(edge.x - edge.w / 2, edge.y - edge.h / 2, edge.w, edge.h);
      ctx.strokeRect(edge.x - edge.w / 2, edge.y - edge.h / 2, edge.w, edge.h);
    });

    // Draw rotation handle
    const rotX = sel.x + sel.width / 2;
    const rotY = sel.y - 30;
    ctx.beginPath();
    ctx.arc(rotX, rotY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw rotation handle line
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rotX, rotY);
    ctx.lineTo(rotX, sel.y);
    ctx.stroke();
  };

  // Export texture from selection area
  const exportTextureFromSelection = () => {
    const img = imageRef.current;
    if (!img || !img.complete) return null;

    const sel = selectionRectRef.current;

    // Inner dashed box (the actual texture window)
    const innerX = sel.x + sel.width * 0.1;
    const innerY = sel.y + sel.height * 0.1;
    const innerW = sel.width * 0.8;
    const innerH = sel.height * 0.8;

    // Export at high resolution (2048px width)
    const exportW = 2048;
    const exportH = Math.round(exportW * (innerH / innerW));

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportW;
    exportCanvas.height = exportH;
    const ctx = exportCanvas.getContext('2d');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Scale factor from preview-space -> export-space
    const s = exportW / innerW;

    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;

    const renderScaleX = baseScaleRef.current * textureTransform.scaleX;
    const renderScaleY = baseScaleRef.current * textureTransform.scaleY;

    ctx.save();

    // Map inner dashed box to export canvas space
    ctx.scale(s, s);
    ctx.translate(-innerX, -innerY);

    // Apply same transforms as preview
    ctx.translate(textureTransform.translateX, textureTransform.translateY);
    ctx.rotate((textureTransform.rotationDeg * Math.PI) / 180);
    ctx.scale(renderScaleX, renderScaleY);

    // Draw full-res original image
    ctx.drawImage(img, -imgW / 2, -imgH / 2);

    ctx.restore();

    // Use PNG to avoid JPEG artifacts
    return exportCanvas.toDataURL('image/png');
  };

  // Apply exported texture to all texture layers
  const applyTextureTransformToAllLayers = () => {
    const dataUrl = exportTextureFromSelection();
    if (!dataUrl) {
      return;
    }

    // Store the current transform state before applying
    lastAppliedTransformRef.current = {
      ...textureTransform,
      baseScale: baseScaleRef.current,
      selectionRect: { ...selectionRectRef.current },
    };

    // Store the original source image if not already stored
    if (!originalSourceImageRef.current && imageRef.current) {
      originalSourceImageRef.current = imageRef.current.src;
    }

    // Load exported texture
    const loader = textureLoader || new THREE.TextureLoader();
    loader.load(
      dataUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.flipY = false;
        
        // Enable anisotropy for better quality
        if (renderer && renderer.capabilities) {
          texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        }
        
        texture.needsUpdate = true;

        // Apply to texture layers based on visibility:
        // - If full bleed is visible → apply only to full bleed layers
        // - If full bleed is hidden → apply only to shrunk layers (NOT frame, NOT back)
        
        // Find full bleed mesh visibility
        const fullBleedMesh = meshes.find(m => m.meshType === "fullBleed");
        const fullBleedVisible = fullBleedMesh ? fullBleedMesh.visible : false;
        
        // Use ALL texture layers and filter ourselves to ensure frame is excluded
        const layersToProcess = allTextureLayers.length > 0 ? allTextureLayers : textureLayers;
        
        layersToProcess.forEach((layer) => {
          if (!layer.mesh || !layer.material) return;
          
          // Find the mesh info to check visibility
          const layerMesh = meshes.find(m => m.mesh === layer.mesh);
          if (!layerMesh && !layer.mesh.visible) return; // Skip if mesh not found and not visible
          
          // Determine which layers should receive the texture
          const isFullBleedLayer = layer.meshType === "fullBleed";
          const isShrunkLayer = layer.meshType === "shrunk";
          const isFrameLayer = layer.meshType === "frame";
          
          // CRITICAL: Skip frame layers - NEVER apply to frame
          if (isFrameLayer) {
            return;
          }
          
          // CRITICAL: Skip if mesh name indicates it's a frame or back mesh
          const meshNameLower = (layer.meshName || "").toLowerCase();
          // If name contains frame/edge/back/rear, skip UNLESS it's explicitly full bleed or shrunk
          // This handles cases like "Front_Frame", "Back_Frame", etc.
          if ((meshNameLower.includes("frame") || meshNameLower.includes("edge") ||
               meshNameLower.includes("back") || meshNameLower.includes("rear")) &&
              !isFullBleedLayer && !isShrunkLayer) {
            return; // Skip frame/back meshes that aren't full bleed or shrunk
          }
          
          // Apply logic:
          // - If full bleed is visible → apply only to full bleed layers
          // - If full bleed is hidden → apply only to shrunk layers
          let shouldApply = false;
          
          if (isFullBleedLayer) {
            // Apply if full bleed mesh is visible
            const layerVisible = layerMesh ? layerMesh.visible : layer.mesh.visible;
            shouldApply = fullBleedVisible && layerVisible;
          } else if (isShrunkLayer) {
            // Apply if full bleed is hidden AND shrunk mesh is visible
            const layerVisible = layerMesh ? layerMesh.visible : layer.mesh.visible;
            shouldApply = !fullBleedVisible && layerVisible;
          } else {
            // For layers without meshType, don't apply (only full bleed or shrunk)
            shouldApply = false;
          }
          
          if (!shouldApply) return;
          
          // CRITICAL: Only apply to PRINT materials (artwork layers)
          if (layer.materialCategory !== "PRINT") {
            return; // Skip non-PRINT materials (METAL, GLASS, etc.)
          }

          const mats = Array.isArray(layer.mesh.material) ? layer.mesh.material : [layer.mesh.material];
          const mat = mats[layer.materialIndex];
          if (!mat) return;
          
          // CRITICAL: Skip back materials - check material name and mesh name for "back" indicators
          const matName = (mat.name || "").toLowerCase();
          const meshName = (layer.meshName || "").toLowerCase();
          if (matName.includes("back") || meshName.includes("back") || 
              matName.includes("rear") || meshName.includes("rear")) {
            return; // Skip back materials
          }
          
          // CRITICAL: Ensure material is FrontSide only to prevent back side rendering
          mat.side = THREE.FrontSide;
          
          // Also ensure material is not transparent (for artwork layers)
          mat.transparent = false;
          mat.opacity = 1.0;
          
          // Ensure depthWrite is enabled for proper rendering
          mat.depthWrite = true;
          mat.depthTest = true;

          // Clone texture to avoid sharing references
          const clonedTex = texture.clone();
          clonedTex.needsUpdate = true;

          mat[layer.mapType] = clonedTex;
          mat.needsUpdate = true;
        });

        onClose();
      },
      undefined,
      (error) => {
      }
    );
  };

  // Reset transform to initial fit state
  const resetTextureTransform = () => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    // Reset to default initialization
    initializeTextureTransform(img, canvas.width, canvas.height);

    // Clear the last applied transform so it uses default on next open
    lastAppliedTransformRef.current = null;
  };

  // Handle mouse interactions
  const handleMouseDown = (e, interactionType) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!rect || !canvas) return;

    // Convert display coordinates to canvas pixel coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Store drag start in ref to ensure it's always current
    dragStartRef.current = {
      x,
      y,
      transform: { ...textureTransformRef.current },
    };
    
    setIsDragging(interactionType);
  };

  // handleMouseMove and handleMouseUp are now defined inline in the useEffect
  // to avoid dependency issues and ensure smooth dragging

  // Global mouse event listeners
  // Use refs to avoid recreating listeners on every transform change
  const textureTransformRef = useRef(textureTransform);
  useEffect(() => {
    textureTransformRef.current = textureTransform;
  }, [textureTransform]);

  useEffect(() => {
    if (isDragging) {
      const handleMove = (e) => {
        if (!canvasRef.current) return;
        
        // Get current drag type from ref (not closure)
        const currentDragType = isDraggingRef.current;
        if (!currentDragType) return; // Drag ended

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();

        // Convert display coordinates to canvas pixel coordinates
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        // Use ref to get current drag start values
        const dragStart = dragStartRef.current;
        const deltaX = x - dragStart.x;
        const deltaY = y - dragStart.y;

        let newTransform = { ...dragStart.transform };

        if (currentDragType === 'pan') {
          // Pan: move image
          newTransform.translateX += deltaX;
          newTransform.translateY += deltaY;
        } else if (currentDragType.startsWith('corner-')) {
          // Corner drag: scale both axes proportionally
          const sel = selectionRectRef.current;
          const centerX = sel.x + sel.width / 2;
          const centerY = sel.y + sel.height / 2;

          const startDist = Math.sqrt(
            Math.pow(dragStart.x - centerX, 2) + Math.pow(dragStart.y - centerY, 2)
          );
          const currentDist = Math.sqrt(
            Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)
          );

          if (startDist > 0.01) {
            const scaleFactor = currentDist / startDist;
            newTransform.scaleX = Math.max(0.1, Math.min(10, dragStart.transform.scaleX * scaleFactor));
            newTransform.scaleY = Math.max(0.1, Math.min(10, dragStart.transform.scaleY * scaleFactor));
          }
        } else if (currentDragType.startsWith('edge-')) {
          // Edge drag: scale one axis independently
          const sel = selectionRectRef.current;
          const centerX = sel.x + sel.width / 2;
          const centerY = sel.y + sel.height / 2;

          if (currentDragType === 'edge-top') {
            // Top edge: scale based on distance from center (negative Y = up)
            const startDistY = centerY - dragStart.y; // Distance from center to top edge
            const currentDistY = centerY - y;
            if (Math.abs(startDistY) > 0.01) {
              const scaleFactor = currentDistY / startDistY;
              newTransform.scaleY = Math.max(0.1, Math.min(10, dragStart.transform.scaleY * scaleFactor));
            }
          } else if (currentDragType === 'edge-bottom') {
            // Bottom edge: scale based on distance from center (positive Y = down)
            const startDistY = dragStart.y - centerY; // Distance from center to bottom edge
            const currentDistY = y - centerY;
            if (Math.abs(startDistY) > 0.01) {
              const scaleFactor = currentDistY / startDistY;
              newTransform.scaleY = Math.max(0.1, Math.min(10, dragStart.transform.scaleY * scaleFactor));
            }
          } else if (currentDragType === 'edge-left') {
            // Left edge: scale based on distance from center (negative X = left)
            const startDistX = centerX - dragStart.x; // Distance from center to left edge
            const currentDistX = centerX - x;
            if (Math.abs(startDistX) > 0.01) {
              const scaleFactor = currentDistX / startDistX;
              newTransform.scaleX = Math.max(0.1, Math.min(10, dragStart.transform.scaleX * scaleFactor));
            }
          } else if (currentDragType === 'edge-right') {
            // Right edge: scale based on distance from center (positive X = right)
            const startDistX = dragStart.x - centerX; // Distance from center to right edge
            const currentDistX = x - centerX;
            if (Math.abs(startDistX) > 0.01) {
              const scaleFactor = currentDistX / startDistX;
              newTransform.scaleX = Math.max(0.1, Math.min(10, dragStart.transform.scaleX * scaleFactor));
            }
          }
        } else if (currentDragType === 'rotate') {
          // Rotate: angle from center
          const sel = selectionRectRef.current;
          const centerX = sel.x + sel.width / 2;
          const centerY = sel.y + sel.height / 2;

          const startAngle = Math.atan2(dragStart.y - centerY, dragStart.x - centerX);
          const currentAngle = Math.atan2(y - centerY, x - centerX);
          const deltaAngle = ((currentAngle - startAngle) * 180) / Math.PI;

          newTransform.rotationDeg = dragStart.transform.rotationDeg + deltaAngle;
        }

        setTextureTransform(newTransform);
      };

      const handleUp = () => {
        // Ensure the transform state is persisted before clearing drag state
        // The transform should already be set by the last handleMove call
        setIsDragging(null);
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
      return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };
    }
  }, [isDragging]);

  // Re-render canvas when transform changes
  // Use requestAnimationFrame for smooth rendering during drag
  const renderFrameRef = useRef(null);
  useEffect(() => {
    if (isOpen && imageRef.current) {
      // Cancel any pending render
      if (renderFrameRef.current) {
        cancelAnimationFrame(renderFrameRef.current);
      }
      // Schedule render for next frame
      renderFrameRef.current = requestAnimationFrame(() => {
        renderTextureTransform();
        renderFrameRef.current = null;
      });
    }
    return () => {
      if (renderFrameRef.current) {
        cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = null;
      }
    };
  }, [textureTransform, isOpen]);

  // Listen for texture-loaded event to reload image when texture finishes loading
  useEffect(() => {
    const handleTextureLoaded = () => {
      if (isOpen && textureLayers.length > 0) {
        // Re-trigger the initialization effect
        const mapLayer = textureLayers.find(layer => layer.mapType === 'map');
        if (mapLayer && mapLayer.mesh) {
          const mats = Array.isArray(mapLayer.mesh.material) ? mapLayer.mesh.material : [mapLayer.mesh.material];
          const mat = mats[mapLayer.materialIndex];
          if (mat && mat.map && mat.map.image instanceof HTMLImageElement) {
            const imageElement = mat.map.image;
            if (imageElement.complete && imageElement.naturalWidth > 0 && imageElement.src) {
              const img = new Image();
              // Only set crossOrigin for non-blob URLs
              if (typeof imageElement.src === 'string' && !imageElement.src.startsWith('blob:') && !imageElement.src.startsWith('data:')) {
                img.crossOrigin = 'anonymous';
              }
              img.onload = () => {
                imageRef.current = img;
                const canvas = canvasRef.current;
                if (canvas) {
                  initializeTextureTransform(img, canvas.width, canvas.height);
                  renderTextureTransform();
                }
              };
              img.onerror = () => {
                if (process.env.NODE_ENV === 'development') {
                  console.error('Failed to reload texture image');
                }
              };
              img.src = imageElement.src;
            }
          }
        }
      }
    };

    window.addEventListener('texture-loaded', handleTextureLoaded);
    return () => {
      window.removeEventListener('texture-loaded', handleTextureLoaded);
    };
  }, [isOpen, textureLayers]);

  // Initialize when modal opens
  useEffect(() => {
    // Don't initialize if currently dragging (use ref to get current value)
    if (isDraggingRef.current) return;
    
    // Don't re-initialize if already initialized and modal is still open
    if (isInitializedRef.current && isOpen) return;
    
    if (isOpen && textureLayers.length > 0) {
      // Find a texture to use
      let textureToUse = null;
      const mapLayer = textureLayers.find(layer => layer.mapType === 'map');
      if (mapLayer && mapLayer.mesh) {
        const mats = Array.isArray(mapLayer.mesh.material) ? mapLayer.mesh.material : [mapLayer.mesh.material];
        const mat = mats[mapLayer.materialIndex];
        if (mat && mat.map) {
          textureToUse = mat.map;
        }
      }

      if (!textureToUse) {
        textureToUse = testTexture1Ref.current || testTexture2Ref.current;
      }

      // Determine which image to load
      let imageSrc = null;

      // If we have a stored original source image, use that
      if (lastAppliedTransformRef.current && originalSourceImageRef.current) {
        imageSrc = originalSourceImageRef.current;
      } else if (textureToUse && textureToUse.image) {
        // Extract image from texture
        if (textureToUse.image instanceof HTMLImageElement) {
          // Check if image is loaded and has valid dimensions
          if (textureToUse.image.complete && textureToUse.image.naturalWidth > 0 && textureToUse.image.naturalHeight > 0) {
            // Use the image source (can be blob URL, data URL, or regular URL)
            imageSrc = textureToUse.image.src;
            // Verify the src is valid (not empty and is a valid URL/blob/data URL)
            if (!imageSrc || imageSrc === '') {
              imageSrc = testTexturePaths[0];
            }
          } else {
            // Image not fully loaded yet - wait for it
            const imageElement = textureToUse.image;
            imageElement.onload = () => {
              if (isOpen && imageElement.src) {
                // Re-trigger the effect to load the image
                const event = new Event('texture-loaded');
                window.dispatchEvent(event);
              }
            };
            // Use fallback for now, but will be replaced when image loads
            imageSrc = imageElement.src || testTexturePaths[0];
          }
        } else if (textureToUse.image instanceof HTMLCanvasElement) {
          // For canvas, convert to data URL
          try {
            imageSrc = textureToUse.image.toDataURL('image/png');
          } catch (error) {
            if (process.env.NODE_ENV === 'development') {
              console.warn('Failed to convert canvas to data URL:', error);
            }
            imageSrc = testTexturePaths[0];
          }
        } else {
          // Unknown image type, use fallback
          imageSrc = testTexturePaths[0];
        }
      } else {
        // No texture found, use fallback
        imageSrc = testTexturePaths[0];
      }

      // Store the original source image for future restorations
      if (!originalSourceImageRef.current) {
        originalSourceImageRef.current = imageSrc;
      }

      const img = new Image();
      // Only set crossOrigin for non-blob URLs (blob URLs are same-origin and don't need it)
      // Setting crossOrigin on blob URLs can cause them to fail to load
      if (typeof imageSrc === 'string' && !imageSrc.startsWith('blob:') && !imageSrc.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        // Don't reset if currently dragging (use ref to get current value)
        if (isDraggingRef.current) return;
        
        imageRef.current = img;
        const canvas = canvasRef.current;
        if (canvas) {
          // Check if we have a previously applied transform
          if (lastAppliedTransformRef.current) {
            // Restore the last applied transform state
            const lastTransform = lastAppliedTransformRef.current;
            baseScaleRef.current = lastTransform.baseScale;

            if (lastTransform.selectionRect) {
              selectionRectRef.current = lastTransform.selectionRect;
            } else {
              initializeTextureTransform(img, canvas.width, canvas.height);
            }

            setTextureTransform({
              translateX: lastTransform.translateX,
              translateY: lastTransform.translateY,
              scaleX: lastTransform.scaleX,
              scaleY: lastTransform.scaleY,
              rotationDeg: lastTransform.rotationDeg,
            });
          } else {
            // First time opening - use default initialization
            initializeTextureTransform(img, canvas.width, canvas.height);
          }
          renderTextureTransform();
          isInitializedRef.current = true; // Mark as initialized
        }
      };
      img.onerror = (error) => {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to load image in TextureTransformModal:', imageSrc, error);
        }
        // Try to use fallback texture
        if (imageSrc !== testTexturePaths[0]) {
          const fallbackImg = new Image();
          fallbackImg.onload = () => {
            imageRef.current = fallbackImg;
            const canvas = canvasRef.current;
            if (canvas) {
              initializeTextureTransform(fallbackImg, canvas.width, canvas.height);
              renderTextureTransform();
            }
          };
          fallbackImg.onerror = () => {
            if (process.env.NODE_ENV === 'development') {
              console.error('Failed to load fallback texture');
            }
          };
          fallbackImg.src = testTexturePaths[0];
        }
      };
      img.src = imageSrc;
    } else if (!isOpen) {
      // Reset initialization flag when modal closes
      isInitializedRef.current = false;
    }
  }, [isOpen, textureLayers, testTexturePaths]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          background: "rgba(30, 30, 30, 0.95)",
          color: "white",
          padding: 24,
          borderRadius: 12,
          maxWidth: 600,
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 18, fontWeight: 700 }}>
          Transform Texture for Landscape (3:2)
        </h2>
        <p style={{ marginBottom: 12, fontSize: 12, opacity: 0.8, lineHeight: 1.5 }}>
          Drag the image to pan, use corner/edge handles to scale, and the rotation handle to rotate. Only the area inside the dashed box will be applied to the model.
        </p>

        {/* Transform Indicators */}
        <div style={{
          marginBottom: 20,
          padding: 12,
          background: "rgba(255,255,255,0.05)",
          borderRadius: 6,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 13,
        }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ opacity: 0.7, fontSize: 11, marginBottom: 4 }}>Scale X</div>
            <div style={{ fontWeight: 700, color: "#00CED1" }}>
              {textureTransform.scaleX.toFixed(2)}x
            </div>
          </div>
          <div style={{ width: 1, height: 30, background: "rgba(255,255,255,0.2)" }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ opacity: 0.7, fontSize: 11, marginBottom: 4 }}>Scale Y</div>
            <div style={{ fontWeight: 700, color: "#00CED1" }}>
              {textureTransform.scaleY.toFixed(2)}x
            </div>
          </div>
          <div style={{ width: 1, height: 30, background: "rgba(255,255,255,0.2)" }} />
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ opacity: 0.7, fontSize: 11, marginBottom: 4 }}>Rotation</div>
            <div style={{ fontWeight: 700, color: "#00CED1" }}>
              {textureTransform.rotationDeg.toFixed(1)}°
            </div>
          </div>
        </div>

        {/* Canvas Container */}
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "3/2",
            marginBottom: 20,
            border: "2px solid rgba(255,255,255,0.2)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <canvas
            ref={canvasRef}
            width={500}
            height={333}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              cursor: isDragging === 'pan' ? 'grabbing' : isDragging?.startsWith('corner') ? 'nwse-resize' : isDragging?.startsWith('edge') ? (isDragging.includes('top') || isDragging.includes('bottom') ? 'ns-resize' : 'ew-resize') : isDragging === 'rotate' ? 'grab' : 'default',
            }}
            onMouseDown={(e) => {
              const canvas = canvasRef.current;
              const rect = canvas?.getBoundingClientRect();
              if (!rect || !canvas) return;

              // Convert display coordinates to canvas pixel coordinates
              const scaleX = canvas.width / rect.width;
              const scaleY = canvas.height / rect.height;
              const x = (e.clientX - rect.left) * scaleX;
              const y = (e.clientY - rect.top) * scaleY;

              // Check if clicking on handles
              const sel = selectionRectRef.current;
              const handleSize = 12;
              const edgeHandleSize = 8;

              // Check corner handles
              const corners = [
                { x: sel.x, y: sel.y, type: 'corner-tl' },
                { x: sel.x + sel.width, y: sel.y, type: 'corner-tr' },
                { x: sel.x, y: sel.y + sel.height, type: 'corner-bl' },
                { x: sel.x + sel.width, y: sel.y + sel.height, type: 'corner-br' },
              ];

              for (const corner of corners) {
                if (Math.abs(x - corner.x) < handleSize && Math.abs(y - corner.y) < handleSize) {
                  handleMouseDown(e, corner.type);
                  return;
                }
              }

              // Check edge handles
              const edges = [
                { x: sel.x + sel.width / 2, y: sel.y, type: 'edge-top', check: (x, y) => Math.abs(x - (sel.x + sel.width / 2)) < sel.width / 2 && Math.abs(y - sel.y) < edgeHandleSize },
                { x: sel.x + sel.width / 2, y: sel.y + sel.height, type: 'edge-bottom', check: (x, y) => Math.abs(x - (sel.x + sel.width / 2)) < sel.width / 2 && Math.abs(y - (sel.y + sel.height)) < edgeHandleSize },
                { x: sel.x, y: sel.y + sel.height / 2, type: 'edge-left', check: (x, y) => Math.abs(x - sel.x) < edgeHandleSize && Math.abs(y - (sel.y + sel.height / 2)) < sel.height / 2 },
                { x: sel.x + sel.width, y: sel.y + sel.height / 2, type: 'edge-right', check: (x, y) => Math.abs(x - (sel.x + sel.width)) < edgeHandleSize && Math.abs(y - (sel.y + sel.height / 2)) < sel.height / 2 },
              ];

              for (const edge of edges) {
                if (edge.check(x, y)) {
                  handleMouseDown(e, edge.type);
                  return;
                }
              }

              // Check rotation handle
              const rotX = sel.x + sel.width / 2;
              const rotY = sel.y - 30;
              if (Math.abs(x - rotX) < 15 && Math.abs(y - rotY) < 15) {
                handleMouseDown(e, 'rotate');
                return;
              }

              // Default: pan
              handleMouseDown(e, 'pan');
            }}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={resetTextureTransform}
            style={{
              flex: 1,
              padding: 12,
              border: 0,
              borderRadius: 6,
              background: "#666",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Reset
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: 12,
              border: 0,
              borderRadius: 6,
              background: "#2196F3",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            onClick={applyTextureTransformToAllLayers}
            style={{
              flex: 1,
              padding: 12,
              border: 0,
              borderRadius: 6,
              background: "#4CAF50",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Confirm & Apply
          </button>
        </div>
      </div>
    </div>
  );
}
