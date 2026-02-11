import { useRef, useState, useEffect } from 'react';
import { ArtworkViewer } from './viewer/index.jsx';
import { GlbTextureSwapTester } from './demo/index.jsx';
import { CURRENT_APP_MODE, APP_MODE, UI_CONFIG } from './config/appConfig.jsx';
import './App.css';

function App() {
  // Switch between API test mode and demo mode
  // Change CURRENT_APP_MODE in appConfig.jsx to switch modes
  if (CURRENT_APP_MODE === APP_MODE.DEMO) {
    return (
      <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
        <GlbTextureSwapTester />
      </div>
    );
  }

  // API Test Mode - Simplified interface
  const viewerRef = useRef(null);
  const [status, setStatus] = useState('Ready - Upload model and texture to start');
  const [currentMode, setCurrentMode] = useState('fullBleed');
  const [materialType, setMaterialType] = useState('ACRYLIC');
  const [reflectionIntensity, setReflectionIntensity] = useState(0.2);
  
  // File state - store File objects directly
  const [modelFile, setModelFile] = useState(null);
  const [artworkFile, setArtworkFile] = useState(null);
  const [frameFile, setFrameFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Store blob URLs for texture loading (textures can use blob URLs)
  const [artworkUrl, setArtworkUrl] = useState(null);
  const [frameUrl, setFrameUrl] = useState(null);

  // Handle file uploads
  const handleModelUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setModelFile(file);
      setStatus(`Model uploaded: ${file.name}`);
    }
  };

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

  // Setup scene with uploaded files
  const handleSetup = async () => {
    if (!modelFile) {
      setStatus('Error: Please upload a model file');
      return;
    }
    if (!artworkUrl) {
      setStatus('Error: Please upload an artwork texture');
      return;
    }

    setIsLoading(true);
    setStatus('Setting up scene...');

    try {
      // Pass File object directly for model (ModelManager handles it)
      // Pass blob URL for textures (TextureLoader handles blob URLs fine)
      await viewerRef.current?.setup({
        modelPath: modelFile, // Pass File object directly
        artworkTexture: artworkUrl,
        materialType: materialType,
        frameTexture: frameUrl || undefined,
        mode: currentMode,
      });
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

  // Change material type
  const handleMaterialChange = (type) => {
    setMaterialType(type);
    viewerRef.current?.setMaterialType(type);
    setStatus(`Material changed to: ${type}`);
  };

  // Handle reflection intensity change
  const handleReflectionIntensityChange = (value) => {
    setReflectionIntensity(value);
    viewerRef.current?.setReflectionIntensity(value);
    setStatus(`Reflection intensity: ${value.toFixed(2)}`);
  };

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      if (artworkUrl) URL.revokeObjectURL(artworkUrl);
      if (frameUrl) URL.revokeObjectURL(frameUrl);
    };
  }, [artworkUrl, frameUrl]);

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      display: 'flex',
      background: UI_CONFIG.background.gradient, // Match demo mode background
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
            setStatus('Viewer ready - Upload files to start');
            // Get initial reflection intensity from API
            const lighting = api.getLighting();
            if (lighting && typeof lighting.reflectionIntensity === 'number') {
              setReflectionIntensity(lighting.reflectionIntensity);
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
          
          {/* Model Upload */}
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '11px' }}>
              Model (GLB) *
            </label>
            <input
              type="file"
              accept=".glb"
              onChange={handleModelUpload}
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
            {modelFile && (
              <div style={{ fontSize: '10px', color: '#4CAF50', marginTop: '5px' }}>
                ✓ {modelFile.name}
              </div>
            )}
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

        {/* Material Type Selection */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ color: '#FFC107', marginTop: 0 }}>Material Type</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
            {['ACRYLIC', 'METAL', 'METAL_BOX', 'WOOD', 'MIRROR'].map((type) => (
              <button
                key={type}
                onClick={() => handleMaterialChange(type)}
                style={{
                  padding: '8px',
                  backgroundColor: materialType === type ? '#4CAF50' : '#666',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                {type}
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
            disabled={isLoading || !modelFile || !artworkUrl}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: (!modelFile || !artworkUrl) ? '#555' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!modelFile || !artworkUrl) ? 'not-allowed' : 'pointer',
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
          1. Upload model (GLB) and artwork texture
          <br />
          2. Select material type
          <br />
          3. Click "Setup Scene"
          <br />
          4. Use controls to update textures or switch modes
        </div>
      </div>
    </div>
  );
}

export default App;
