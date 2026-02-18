import { useRef, useState, useEffect } from 'react';
import { ArtworkViewer } from './viewer/index.jsx';
import { UI_CONFIG, getModelPath, getMaterialTypeInfo, getMaterialTypeDisplayName, MATERIAL_TYPE_MAP, getDefaultReflectionIntensity, ORIENTATION_TYPES, DEFAULT_SIZES, EXAMPLE_SIZES, formatSize } from './config/appConfig.jsx';
import { TextureTransformModal } from './components/index.jsx';
import './App.css';

function App() {
  // API Test Mode - Simplified interface
  const viewerRef = useRef(null);
  const [status, setStatus] = useState('Ready - Upload artwork texture to start');
  const [currentMode, setCurrentMode] = useState('fullBleed');
  const [orientation, setOrientation] = useState(ORIENTATION_TYPES.PORTRAIT);
  const [materialType, setMaterialType] = useState('ACRYLIC');
  const [reflectionIntensity, setReflectionIntensity] = useState(() => getDefaultReflectionIntensity('ACRYLIC'));
  const [glassVisible, setGlassVisible] = useState(true);
  const [isTextureTransformModalOpen, setIsTextureTransformModalOpen] = useState(false);
  const [size, setSize] = useState(() => DEFAULT_SIZES.PORTRAIT);
  
  // File state - store File objects directly
  // Note: modelFile is no longer needed as models are loaded automatically based on material type
  const [artworkFile, setArtworkFile] = useState(null);
  const [frameFile, setFrameFile] = useState(null);
  const [hdrFile, setHdrFile] = useState(null); // HDR for non-mirror materials
  const [hdrMirrorFile, setHdrMirrorFile] = useState(null); // HDR for mirror material
  const [backgroundFile, setBackgroundFile] = useState(null); // Background image
  const [isLoading, setIsLoading] = useState(false);

  // Store blob URLs for texture loading (textures can use blob URLs)
  const [artworkUrl, setArtworkUrl] = useState(null);
  const [frameUrl, setFrameUrl] = useState(null);
  const [hdrUrl, setHdrUrl] = useState(null); // HDR URL for non-mirror materials
  const [hdrMirrorUrl, setHdrMirrorUrl] = useState(null); // HDR URL for mirror material
  const [backgroundUrl, setBackgroundUrl] = useState(null); // Background image URL

  // Track if model is loaded to enable real-time size updates
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const previousSizeRef = useRef(size);

  // Real-time size update effect - rescale model when size changes (without reloading)
  useEffect(() => {
    // Skip if model isn't loaded yet
    if (!isModelLoaded || !viewerRef.current) {
      return;
    }
    
    // Skip if size hasn't actually changed
    if (previousSizeRef.current.width === size.width && 
        previousSizeRef.current.height === size.height) {
      return;
    }
    
    // Calculate size ratio
    const defaultSize = orientation === ORIENTATION_TYPES.PORTRAIT 
      ? DEFAULT_SIZES.PORTRAIT 
      : DEFAULT_SIZES.LANDSCAPE;
    
    if (size.width && size.height) {
      const sizeRatio = {
        widthRatio: size.width / defaultSize.width,
        heightRatio: size.height / defaultSize.height,
      };
      
      // Rescale the existing model in real-time
      if (viewerRef.current && typeof viewerRef.current.rescaleModel === 'function') {
        try {
          viewerRef.current.rescaleModel(sizeRatio);
          setStatus(`Size updated to: ${formatSize(size)} (real-time)`);
        } catch (error) {
          console.error('[App] Error rescaling model:', error);
          setStatus(`Size changed to: ${formatSize(size)} - Click "Setup Scene" to apply`);
        }
      }
    }
    
    // Update previous size
    previousSizeRef.current = size;
  }, [size, isModelLoaded, orientation]);

  // Handle file uploads
  // Note: Model upload is no longer needed - models are loaded automatically based on material type
  const handleArtworkUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Clean up old URL
      if (artworkUrl) {
        URL.revokeObjectURL(artworkUrl);
      }
      const url = URL.createObjectURL(file);
      setArtworkFile(file);
      setArtworkUrl(url);
      setStatus(`Artwork texture uploaded: ${file.name}`);
    }
  };

  const handleFrameUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Clean up old URL
      if (frameUrl) {
        URL.revokeObjectURL(frameUrl);
      }
      const url = URL.createObjectURL(file);
      setFrameFile(file);
      setFrameUrl(url);
      setStatus(`Frame texture uploaded: ${file.name}`);
    }
  };

  const handleHdrUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Clean up old URL
      if (hdrUrl) {
        URL.revokeObjectURL(hdrUrl);
      }
      // Store File object directly - EnvironmentManager will handle it
      setHdrFile(file);
      setHdrUrl(null); // Don't create blob URL, pass File directly
      setStatus(`HDR environment uploaded: ${file.name}`);
    }
  };

  const handleHdrMirrorUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Clean up old URL
      if (hdrMirrorUrl) {
        URL.revokeObjectURL(hdrMirrorUrl);
      }
      // Store File object directly - EnvironmentManager will handle it
      setHdrMirrorFile(file);
      setHdrMirrorUrl(null); // Don't create blob URL, pass File directly
      setStatus(`Mirror HDR environment uploaded: ${file.name}`);
    }
  };

  // Setup scene with uploaded files
  const handleSetup = async () => {
    if (!artworkUrl) {
      setStatus('Error: Please upload an artwork texture');
      return;
    }

    setIsLoading(true);
    setStatus('Setting up scene...');

    try {
      // Get material type info (convert display type to internal type)
      const { internalType } = getMaterialTypeInfo(materialType);
      
      // Get model path based on orientation, material type, and size
      const modelPath = getModelPath(orientation, materialType, undefined, size);
      
      // Determine which HDR to use based on material type
      // Pass File object directly - EnvironmentManager will handle it
      const customHdrPath = internalType === 'MIRROR' 
        ? (hdrMirrorFile || undefined)
        : (hdrFile || undefined);

      // Pass model path as string (ModelManager handles both File objects and paths)
      // Pass blob URL for textures and HDR (TextureLoader handles blob URLs fine)
      // Use internal type for setMaterialType
      await viewerRef.current?.setup({
        modelPath: modelPath, // Auto-loaded model path based on orientation and material type
        artworkTexture: artworkUrl,
        orientation: orientation, // REQUIRED: portrait or landscape
        materialType: internalType, // Use internal type for viewer
        frameTexture: frameUrl || undefined,
        hdriPath: customHdrPath, // Custom HDR path based on material type
        mode: currentMode,
        size: size, // Size object with {width, height}
      });
      
      // Sync glass visibility after setup (if acrylic)
      if (internalType === 'ACRYLIC' && viewerRef.current) {
        const glassVis = viewerRef.current.getGlassVisibility();
        if (glassVis !== null) {
          setGlassVisible(glassVis);
        } else {
          // Set initial visibility
          viewerRef.current.setGlassVisibility(glassVisible);
        }
      }
      
      setStatus('Scene ready!');
      setIsModelLoaded(true); // Mark model as loaded
      previousSizeRef.current = size; // Update previous size reference
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Setup error:', error);
      }
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Update artwork texture
  const handleUpdateArtwork = async () => {
    if (!artworkUrl) {
      setStatus('Error: Please upload an artwork texture first');
      return;
    }

    setIsLoading(true);
    setStatus('Updating artwork...');

    try {
      await viewerRef.current?.updateArtwork(artworkUrl);
      setStatus('Artwork updated!');
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Update error:', error);
      }
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Update frame texture
  const handleUpdateFrame = async () => {
    if (!frameUrl) {
      setStatus('Error: Please upload a frame texture first');
      return;
    }

    setIsLoading(true);
    setStatus('Updating frame...');

    try {
      await viewerRef.current?.updateFrame(frameUrl);
      setStatus('Frame updated!');
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Update error:', error);
      }
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Switch mode
  const handleSwitchMode = () => {
    const newMode = currentMode === 'fullBleed' ? 'shrunk' : 'fullBleed';
    viewerRef.current?.setMode(newMode);
    setCurrentMode(newMode);
    setStatus(`Mode switched to: ${newMode}`);
  };

  // Handle USDZ export
  const [isExportingUSDZ, setIsExportingUSDZ] = useState(false);
  const handleExportUSDZ = async () => {
    if (!viewerRef.current) {
      setStatus('Error: Viewer not initialized');
      return;
    }

    if (typeof viewerRef.current.exportUSDZ !== 'function') {
      setStatus('Error: USDZ export not available');
      return;
    }

    setIsExportingUSDZ(true);
    setStatus('Exporting to USDZ...');

    try {
      const filename = `artwork_${materialType.toLowerCase()}_${formatSize(size) || 'default'}.usdz`;
      await viewerRef.current.exportUSDZ(filename);
      setStatus('USDZ export completed!');
    } catch (error) {
      console.error('USDZ export error:', error);
      setStatus(`Error exporting USDZ: ${error.message}`);
    } finally {
      setIsExportingUSDZ(false);
    }
  };

  // Handle GLB export
  const [isExportingGLB, setIsExportingGLB] = useState(false);
  const handleExportGLB = async () => {
    if (!viewerRef.current) {
      setStatus('Error: Viewer not initialized');
      return;
    }

    if (typeof viewerRef.current.exportGLB !== 'function') {
      setStatus('Error: GLB export not available');
      return;
    }

    setIsExportingGLB(true);
    setStatus('Exporting to GLB...');

    try {
      const filename = `artwork_${materialType.toLowerCase()}_${formatSize(size) || 'default'}.glb`;
      await viewerRef.current.exportGLB(filename);
      setStatus('GLB export completed!');
    } catch (error) {
      console.error('GLB export error:', error);
      setStatus(`Error exporting GLB: ${error.message}`);
    } finally {
      setIsExportingGLB(false);
    }
  };

  // Handle orientation change
  const handleOrientationChange = async (newOrientation) => {
    setOrientation(newOrientation);
    // Update size to default for new orientation
    const newDefaultSize = newOrientation === ORIENTATION_TYPES.PORTRAIT 
      ? DEFAULT_SIZES.PORTRAIT 
      : DEFAULT_SIZES.LANDSCAPE;
    setSize(newDefaultSize);
    setStatus(`Orientation changed to: ${newOrientation}...`);
    
    // If artwork is already loaded, automatically call setup to reconfigure pipeline
    if (artworkUrl && viewerRef.current) {
      if (typeof viewerRef.current.setup !== 'function') {
        setStatus(`Orientation changed to: ${newOrientation} - Setup function not available`);
        return;
      }
      
      setIsLoading(true);
      try {
        const { internalType } = getMaterialTypeInfo(materialType);
        const newModelPath = getModelPath(newOrientation, materialType, undefined, newDefaultSize);
        const customHdrPath = internalType === 'MIRROR' 
          ? (hdrMirrorFile || undefined)
          : (hdrFile || undefined);
        
        await viewerRef.current.setup({
          modelPath: newModelPath,
          artworkTexture: artworkUrl,
          orientation: newOrientation,
          materialType: internalType,
          frameTexture: frameUrl || undefined,
          hdriPath: customHdrPath,
          mode: currentMode,
          size: newDefaultSize,
        });
        
        const defaultReflectionIntensity = getDefaultReflectionIntensity(internalType);
        if (viewerRef.current && typeof viewerRef.current.setReflectionIntensity === 'function') {
          viewerRef.current.setReflectionIntensity(defaultReflectionIntensity);
        }
        
        setStatus(`Orientation changed to: ${newOrientation} - Scene reconfigured`);
        setIsModelLoaded(true); // Mark model as loaded
        previousSizeRef.current = newDefaultSize; // Update previous size reference
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to reconfigure scene with new orientation:', error);
        }
        setStatus(`Error: Failed to load model for ${newOrientation} - ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Change material type
  const handleMaterialChange = async (displayType) => {
    // Get internal type and metal finish from display type
    const { internalType } = getMaterialTypeInfo(displayType);
    
    setMaterialType(displayType);
    
    // Update reflection intensity to material-specific default
    const defaultReflectionIntensity = getDefaultReflectionIntensity(internalType);
    setReflectionIntensity(defaultReflectionIntensity);
    
    setStatus(`Material changed to: ${displayType}...`);
    
    // If artwork is already loaded, automatically call setup to reconfigure pipeline for new material type
    if (artworkUrl) {
      if (!viewerRef.current) {
        setStatus(`Material changed to: ${displayType} - Waiting for viewer...`);
        // Retry after a short delay
        setTimeout(() => handleMaterialChange(displayType), 500);
        return;
      }
      
      if (typeof viewerRef.current.setup !== 'function') {
        setStatus(`Material changed to: ${displayType} - Setup function not available`);
        return;
      }
      
      setIsLoading(true);
      try {
        // Get new model path based on orientation, display type, and size
        const newModelPath = getModelPath(orientation, displayType, undefined, size);
        
        // Determine which HDR to use based on internal material type
        const customHdrPath = internalType === 'MIRROR' 
          ? (hdrMirrorFile || undefined)
          : (hdrFile || undefined);
        
        
        // Automatically call setup to reconfigure the entire pipeline for the new material type
        // This ensures all material-specific configurations are properly applied
        await viewerRef.current.setup({
          modelPath: newModelPath,
          artworkTexture: artworkUrl,
          orientation: orientation, // REQUIRED: portrait or landscape
          materialType: internalType, // Use internal type for viewer
          frameTexture: frameUrl || undefined,
          hdriPath: customHdrPath,
          mode: currentMode,
          size: size,
        });
        
        // Update reflection intensity after setup (setup may reset it)
        if (viewerRef.current && typeof viewerRef.current.setReflectionIntensity === 'function') {
          viewerRef.current.setReflectionIntensity(defaultReflectionIntensity);
        }
        
        // Sync glass visibility after setup (if acrylic)
        if (internalType === 'ACRYLIC' && viewerRef.current) {
          const glassVis = viewerRef.current.getGlassVisibility();
          if (glassVis !== null) {
            setGlassVisible(glassVis);
          } else if (typeof viewerRef.current.setGlassVisibility === 'function') {
            viewerRef.current.setGlassVisibility(glassVisible);
          }
        }
        
        setStatus(`Material changed to: ${displayType} - Scene reconfigured automatically`);
        setIsModelLoaded(true); // Mark model as loaded
        previousSizeRef.current = size; // Update previous size reference
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to reconfigure scene with new material:', error);
        }
        setStatus(`Error: Failed to load model for ${displayType} - ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    } else {
      // No artwork loaded yet - just update the material type
      // Setup will be called automatically when artwork is uploaded
      if (viewerRef.current && typeof viewerRef.current.setMaterialType === 'function') {
        viewerRef.current.setMaterialType(internalType);
      }
      setStatus(`Material changed to: ${displayType} - Upload artwork to load model`);
    }
  };

  // Handle reflection intensity change
  const handleReflectionIntensityChange = (value) => {
    setReflectionIntensity(value);
    viewerRef.current?.setReflectionIntensity(value);
    setStatus(`Reflection intensity: ${value.toFixed(2)}`);
  };

  // Handle glass visibility toggle (acrylic only)
  const handleToggleGlassVisibility = () => {
    const { internalType } = getMaterialTypeInfo(materialType);
    if (internalType !== 'ACRYLIC') {
      setStatus('Glass visibility control is only available for ACRYLIC material type');
      return;
    }
    
    const newVisibility = !glassVisible;
    const success = viewerRef.current?.setGlassVisibility(newVisibility);
    
    if (success) {
      setGlassVisible(newVisibility);
      setStatus(`Glass ${newVisibility ? 'enabled' : 'disabled'}`);
    } else {
      setStatus('Failed to toggle glass visibility - make sure model is loaded');
    }
  };

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      if (artworkUrl) URL.revokeObjectURL(artworkUrl);
      if (frameUrl) URL.revokeObjectURL(frameUrl);
      // Note: HDR files are passed as File objects, not blob URLs, so no cleanup needed
    };
  }, [artworkUrl, frameUrl]);

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      display: 'flex',
      background: UI_CONFIG.background.gradient,
    }}>
      {/* Viewer */}
      <div style={{ 
        flex: 1, 
        position: 'relative', 
        zIndex: 1,
        overflow: 'hidden',
        width: '100%',
        height: '100%'
      }}>
        <ArtworkViewer
          ref={viewerRef}
          onReady={(api) => {
            if (process.env.NODE_ENV === 'development') {
            }
            setStatus('Viewer ready - Upload artwork texture to start');
            // Use material-specific default reflection intensity for ACRYLIC and MIRROR
            const { internalType: currentInternalType } = getMaterialTypeInfo(materialType);
            const defaultReflectionIntensity = getDefaultReflectionIntensity(currentInternalType);
            setReflectionIntensity(defaultReflectionIntensity);
            if (api.setReflectionIntensity) {
              api.setReflectionIntensity(defaultReflectionIntensity);
            }
            // Get initial glass visibility (if acrylic)
            if (currentInternalType === 'ACRYLIC') {
              const glassVis = api.getGlassVisibility();
              if (glassVis !== null) {
                setGlassVisible(glassVis);
              }
            }
          }}
          onError={(error) => {
            if (process.env.NODE_ENV === 'development') {
              console.error('Viewer error:', error);
            }
            setStatus(`Error: ${error}`);
          }}
          onModeChange={(mode) => {
            setCurrentMode(mode);
            setStatus(`Mode changed to: ${mode}`);
          }}
        />
      </div>

      {/* Control Panel */}
      <div
        style={{
          width: '350px',
          minWidth: '350px',
          backgroundColor: 'rgba(0, 0, 0, 0.95)',
          color: 'white',
          padding: '20px',
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: '12px',
          position: 'relative',
          zIndex: 1000,
          boxShadow: '-2px 0 10px rgba(0, 0, 0, 0.5)',
          flexShrink: 0,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <h2 style={{ marginTop: 0, color: '#4CAF50' }}>API Test Panel</h2>
        
        {/* Status */}
        <div
          style={{
            padding: '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '4px',
            marginBottom: '20px',
            minHeight: '40px',
          }}
        >
          <strong>Status:</strong> {status}
        </div>

        {/* File Uploads */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ color: '#FFC107', marginTop: 0 }}>File Uploads</h3>
          
          {/* Model Info - Auto-loaded based on orientation and material type */}
          <div style={{ marginBottom: '15px', padding: '8px', backgroundColor: 'rgba(76, 175, 80, 0.1)', borderRadius: '4px' }}>
            <div style={{ fontSize: '11px', color: '#4CAF50', marginBottom: '5px' }}>
              ✓ Model: Auto-loaded based on orientation & material type
            </div>
            <div style={{ fontSize: '10px', color: '#aaa' }}>
              Orientation: {orientation.charAt(0).toUpperCase() + orientation.slice(1)}
            </div>
            <div style={{ fontSize: '10px', color: '#aaa' }}>
              Material: {getMaterialTypeDisplayName(materialType)}
            </div>
            <div style={{ fontSize: '10px', color: '#aaa' }}>
              Size: {formatSize(size)}
            </div>
          </div>

          {/* Artwork Texture Upload */}
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '11px' }}>
              Artwork Texture *
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleArtworkUpload}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '11px',
                backgroundColor: '#333',
                color: 'white',
                border: '1px solid #555',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            />
            {artworkFile && (
              <div style={{ fontSize: '10px', color: '#4CAF50', marginTop: '5px' }}>
                ✓ {artworkFile.name}
              </div>
            )}
          </div>

          {/* Frame Texture Upload (Optional) */}
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '11px' }}>
              Frame Texture (Optional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFrameUpload}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '11px',
                backgroundColor: '#333',
                color: 'white',
                border: '1px solid #555',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            />
            {frameFile && (
              <div style={{ fontSize: '10px', color: '#4CAF50', marginTop: '5px' }}>
                ✓ {frameFile.name}
              </div>
            )}
          </div>
        </div>

        {/* Orientation Selection */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ color: '#FFC107', marginTop: 0 }}>Orientation</h3>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button
              onClick={() => handleOrientationChange(ORIENTATION_TYPES.PORTRAIT)}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: orientation === ORIENTATION_TYPES.PORTRAIT ? '#4CAF50' : '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            >
              Portrait
            </button>
            <button
              onClick={() => handleOrientationChange(ORIENTATION_TYPES.LANDSCAPE)}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: orientation === ORIENTATION_TYPES.LANDSCAPE ? '#4CAF50' : '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            >
              Landscape
            </button>
          </div>
        </div>

        {/* Size Selection */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ color: '#FFC107', marginTop: 0 }}>Size</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {(orientation === ORIENTATION_TYPES.PORTRAIT ? EXAMPLE_SIZES.PORTRAIT : EXAMPLE_SIZES.LANDSCAPE).map((sizeOption) => (
              <button
                key={sizeOption.label}
                onClick={() => {
                  const newSize = { width: sizeOption.width, height: sizeOption.height };
                  setSize(newSize);
                  // Status will be updated by useEffect if model is loaded
                  if (!isModelLoaded) {
                    setStatus(`Size changed to: ${sizeOption.label} - Click "Setup Scene" to apply`);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: size.width === sizeOption.width && size.height === sizeOption.height ? '#4CAF50' : '#666',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  textAlign: 'left',
                }}
              >
                {sizeOption.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: '10px', padding: '8px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px' }}>
            <div style={{ fontSize: '10px', color: '#aaa', marginBottom: '5px' }}>
              Custom Size:
            </div>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <input
                type="number"
                placeholder="Width"
                value={size.width || ''}
                onChange={(e) => {
                  const width = parseInt(e.target.value, 10);
                  if (!isNaN(width) && width > 0) {
                    setSize({ ...size, width });
                  }
                }}
                style={{
                  flex: 1,
                  padding: '6px',
                  fontSize: '11px',
                  backgroundColor: '#333',
                  color: 'white',
                  border: '1px solid #555',
                  borderRadius: '4px',
                }}
              />
              <span style={{ color: '#aaa', fontSize: '11px' }}>x</span>
              <input
                type="number"
                placeholder="Height"
                value={size.height || ''}
                onChange={(e) => {
                  const height = parseInt(e.target.value, 10);
                  if (!isNaN(height) && height > 0) {
                    setSize({ ...size, height });
                  }
                }}
                style={{
                  flex: 1,
                  padding: '6px',
                  fontSize: '11px',
                  backgroundColor: '#333',
                  color: 'white',
                  border: '1px solid #555',
                  borderRadius: '4px',
                }}
              />
            </div>
          </div>
        </div>

        {/* Material Type Selection */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ color: '#FFC107', marginTop: 0 }}>Material Type</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
            {[
              { value: 'ACRYLIC', label: 'Acrylic' },
              { value: 'METAL_SILVER', label: 'Metal - Silver' },
              { value: 'METAL_WHITE', label: 'Metal - White' },
              { value: 'METAL_BOX_SILVER', label: 'Metal Box - Silver' },
              { value: 'METAL_BOX_WHITE', label: 'Metal Box - White' },
              { value: 'WOOD', label: 'Wood' },
              { value: 'MIRROR', label: 'Mirror' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => handleMaterialChange(option.value)}
                style={{
                  padding: '8px',
                  backgroundColor: materialType === option.value ? '#4CAF50' : '#666',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mode Selection */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ color: '#FFC107', marginTop: 0 }}>Mode</h3>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button
              onClick={() => {
                viewerRef.current?.setMode('fullBleed');
                setCurrentMode('fullBleed');
              }}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: currentMode === 'fullBleed' ? '#2196F3' : '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Full Bleed
            </button>
            <button
              onClick={() => {
                viewerRef.current?.setMode('shrunk');
                setCurrentMode('shrunk');
              }}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: currentMode === 'shrunk' ? '#2196F3' : '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Shrunk
            </button>
          </div>
        </div>

        {/* Setup Button */}
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={handleSetup}
            disabled={isLoading || !artworkUrl}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: (!artworkUrl) ? '#555' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!artworkUrl) ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
            }}
          >
            {isLoading ? 'Loading...' : 'Setup Scene'}
          </button>
        </div>

        {/* Update Controls */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ color: '#FFC107', marginTop: 0 }}>Update Textures</h3>
          <button
            onClick={handleUpdateFrame}
            disabled={isLoading || !frameUrl}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '5px',
              backgroundColor: (!frameUrl) ? '#555' : '#9C27B0',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!frameUrl) ? 'not-allowed' : 'pointer',
            }}
          >
            Update Frame
          </button>
          <button
            onClick={() => setIsTextureTransformModalOpen(true)}
            disabled={isLoading || !viewerRef.current}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '5px',
              backgroundColor: (!viewerRef.current) ? '#555' : '#FF9800',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!viewerRef.current) ? 'not-allowed' : 'pointer',
            }}
          >
            Transform Texture
          </button>
        </div>

        {/* Export */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ color: '#FFC107', marginTop: 0 }}>Export</h3>
          <button
            onClick={handleExportUSDZ}
            disabled={isLoading || isExportingUSDZ || isExportingGLB || !viewerRef.current || !isModelLoaded}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '10px',
              backgroundColor: (!viewerRef.current || !isModelLoaded || isExportingUSDZ || isExportingGLB) ? '#555' : '#9C27B0',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!viewerRef.current || !isModelLoaded || isExportingUSDZ || isExportingGLB) ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            {isExportingUSDZ ? 'Exporting USDZ...' : 'Export to USDZ'}
          </button>
          <button
            onClick={handleExportGLB}
            disabled={isLoading || isExportingUSDZ || isExportingGLB || !viewerRef.current || !isModelLoaded}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: (!viewerRef.current || !isModelLoaded || isExportingUSDZ || isExportingGLB) ? '#555' : '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!viewerRef.current || !isModelLoaded || isExportingUSDZ || isExportingGLB) ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            {isExportingGLB ? 'Exporting GLB...' : 'Export to GLB'}
          </button>
          <div style={{ 
            fontSize: '10px', 
            color: '#888', 
            marginTop: '5px',
            lineHeight: '1.4'
          }}>
            Export the current 3D model to USDZ (AR) or GLB (3D) format
          </div>
        </div>

        {/* Info */}
        <div
          style={{
            padding: '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '4px',
            fontSize: '10px',
            color: '#aaa',
            marginTop: 'auto',
          }}
        >
          <strong>Instructions:</strong>
          <br />
          1. Select material type (model loads automatically)
          <br />
          2. Upload artwork texture
          <br />
          3. Click "Setup Scene"
          <br />
          4. Use controls to update textures or switch modes
          <br />
          <br />
          <strong>Note:</strong> Models are automatically loaded from assets based on selected material type
        </div>
      </div>

      {/* Texture Transform Modal */}
      {viewerRef.current && (
        <TextureTransformModal
          isOpen={isTextureTransformModalOpen}
          onClose={() => setIsTextureTransformModalOpen(false)}
          textureLayers={viewerRef.current.getTextureLayers?.() || []}
          allTextureLayers={viewerRef.current.getTextureLayers?.() || []}
          meshes={viewerRef.current.getMeshes?.() || []}
          textureLoader={viewerRef.current.getTextureLoader?.() || null}
          renderer={viewerRef.current.getRenderer?.() || null}
        />
      )}
    </div>
  );
}

export default App;
