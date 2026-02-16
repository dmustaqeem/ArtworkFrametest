import { useRef, useState, useEffect } from 'react';
import { ArtworkViewer } from './viewer/index.jsx';
import { UI_CONFIG, getModelPath, getMaterialTypeInfo, getMaterialTypeDisplayName, MATERIAL_TYPE_MAP, getDefaultReflectionIntensity, ORIENTATION_TYPES } from './config/appConfig.jsx';
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
      
      // Get model path based on orientation and material type (models are automatically loaded from assets)
      const modelPath = getModelPath(orientation, materialType);
      
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
    } catch (error) {
      console.error('Setup error:', error);
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
      console.error('Update error:', error);
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
      console.error('Update error:', error);
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

  // Handle orientation change
  const handleOrientationChange = async (newOrientation) => {
    setOrientation(newOrientation);
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
        const newModelPath = getModelPath(newOrientation, materialType);
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
        });
        
        const defaultReflectionIntensity = getDefaultReflectionIntensity(internalType);
        if (viewerRef.current && typeof viewerRef.current.setReflectionIntensity === 'function') {
          viewerRef.current.setReflectionIntensity(defaultReflectionIntensity);
        }
        
        setStatus(`Orientation changed to: ${newOrientation} - Scene reconfigured`);
      } catch (error) {
        console.error('Failed to reconfigure scene with new orientation:', error);
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
        // Get new model path based on orientation and display type
        const newModelPath = getModelPath(orientation, displayType);
        
        // Determine which HDR to use based on internal material type
        const customHdrPath = internalType === 'MIRROR' 
          ? (hdrMirrorFile || undefined)
          : (hdrFile || undefined);
        
        console.log(`[Material Change] Automatically calling setup for ${displayType} (${internalType})`);
        
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
        
        console.log(`[Material Change] Setup completed successfully for ${displayType}`);
        setStatus(`Material changed to: ${displayType} - Scene reconfigured automatically`);
      } catch (error) {
        console.error('Failed to reconfigure scene with new material:', error);
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
            console.log('Viewer ready!', api);
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
            console.error('Viewer error:', error);
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

          {/* HDR Environment Upload (Optional) */}
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '11px' }}>
              HDR Environment (Optional - for non-mirror materials)
            </label>
            <input
              type="file"
              accept=".hdr,.exr"
              onChange={handleHdrUpload}
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
            {hdrFile && (
              <div style={{ fontSize: '10px', color: '#4CAF50', marginTop: '5px' }}>
                ✓ {hdrFile.name}
              </div>
            )}
          </div>

          {/* Mirror HDR Environment Upload (Optional) */}
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '11px' }}>
              Mirror HDR Environment (Optional - for mirror material)
            </label>
            <input
              type="file"
              accept=".hdr,.exr"
              onChange={handleHdrMirrorUpload}
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
            {hdrMirrorFile && (
              <div style={{ fontSize: '10px', color: '#4CAF50', marginTop: '5px' }}>
                ✓ {hdrMirrorFile.name}
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
            onClick={handleUpdateArtwork}
            disabled={isLoading || !artworkUrl}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '5px',
              backgroundColor: (!artworkUrl) ? '#555' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!artworkUrl) ? 'not-allowed' : 'pointer',
            }}
          >
            Update Artwork
          </button>
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
        </div>

        {/* Mode Switch */}
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={handleSwitchMode}
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            Switch Mode ({currentMode === 'fullBleed' ? 'Shrunk' : 'Full Bleed'})
          </button>
        </div>

        {/* Reflection Intensity Control */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ color: '#FFC107', marginTop: 0 }}>Reflection Intensity</h3>
          <div style={{ 
            padding: '10px', 
            backgroundColor: 'rgba(255, 255, 255, 0.05)', 
            borderRadius: '4px',
            marginBottom: '10px'
          }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '8px', 
              fontSize: '11px',
              color: '#aaa'
            }}>
              Intensity: {reflectionIntensity.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={reflectionIntensity}
              onChange={(e) => handleReflectionIntensityChange(parseFloat(e.target.value))}
              disabled={isLoading}
              style={{
                width: '100%',
                cursor: isLoading ? 'not-allowed' : 'pointer',
              }}
            />
            <div style={{ 
              fontSize: '10px', 
              color: '#888', 
              marginTop: '5px',
              lineHeight: '1.4'
            }}>
              Controls the intensity of environment map reflections on glass and reflective surfaces
            </div>
          </div>
        </div>

        {/* Glass Visibility Control (Acrylic only) */}
        {(() => {
          const { internalType } = getMaterialTypeInfo(materialType);
          return internalType === 'ACRYLIC';
        })() && (
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ color: '#FFC107', marginTop: 0 }}>Glass Control</h3>
            <button
              onClick={handleToggleGlassVisibility}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: glassVisible ? '#4CAF50' : '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            >
              {glassVisible ? '✓ Glass Visible' : '✗ Glass Hidden'}
            </button>
            <div style={{ 
              fontSize: '10px', 
              color: '#888', 
              marginTop: '5px',
              lineHeight: '1.4'
            }}>
              Toggle glass layer visibility to test artwork sharpness
            </div>
          </div>
        )}

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
    </div>
  );
}

export default App;
