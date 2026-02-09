import { useRef, useState, useEffect } from 'react';
import { ArtworkViewer } from './viewer/index.jsx';
import { GlbTextureSwapTester } from './demo/index.jsx';
import { CURRENT_APP_MODE, APP_MODE, UI_CONFIG } from './config/appConfig.jsx';
import './App.css';

// Hook to detect mobile screen size
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return isMobile;
};

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
  const isMobile = useIsMobile();
  const [panelOpen, setPanelOpen] = useState(!isMobile); // Panel open by default on desktop, closed on mobile
  const viewerRef = useRef(null);
  const [status, setStatus] = useState('Ready - Upload model and texture to start');
  const [currentMode, setCurrentMode] = useState('fullBleed');
  const [materialType, setMaterialType] = useState('ACRYLIC');
  
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
      flexDirection: isMobile ? 'column' : 'row',
      background: UI_CONFIG.background.gradient, // Match demo mode background
    }}>
      {/* Viewer */}
      <div style={{ 
        flex: 1, 
        position: 'relative', 
        zIndex: 1,
        overflow: 'hidden',
        width: '100%',
        height: isMobile ? (panelOpen ? '50%' : '100%') : '100%',
        transition: 'height 0.3s ease',
      }}>
        {/* Mobile toggle button */}
        {isMobile && (
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              zIndex: 1001,
              padding: '10px 15px',
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            }}
          >
            {panelOpen ? '▼ Hide' : '▲ Show'} Controls
          </button>
        )}
        <ArtworkViewer
          ref={viewerRef}
          onReady={(api) => {
            console.log('Viewer ready!', api);
            setStatus('Viewer ready - Upload files to start');
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
          width: isMobile ? '100%' : '350px',
          minWidth: isMobile ? '100%' : '350px',
          maxWidth: isMobile ? '100%' : '350px',
          backgroundColor: 'rgba(0, 0, 0, 0.95)',
          color: 'white',
          padding: isMobile ? '15px' : '20px',
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: isMobile ? '11px' : '12px',
          position: isMobile ? 'absolute' : 'relative',
          bottom: isMobile ? 0 : 'auto',
          left: isMobile ? 0 : 'auto',
          right: isMobile ? 0 : 'auto',
          zIndex: 1000,
          boxShadow: isMobile ? '0 -2px 10px rgba(0, 0, 0, 0.5)' : '-2px 0 10px rgba(0, 0, 0, 0.5)',
          flexShrink: 0,
          height: isMobile ? (panelOpen ? '50%' : '0') : '100vh',
          maxHeight: isMobile ? '50%' : '100vh',
          display: isMobile ? (panelOpen ? 'flex' : 'none') : 'flex',
          flexDirection: 'column',
          transition: isMobile ? 'height 0.3s ease, opacity 0.3s ease' : 'none',
          opacity: isMobile ? (panelOpen ? 1 : 0) : 1,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ marginTop: 0, marginBottom: 0, color: '#4CAF50', fontSize: isMobile ? '16px' : '20px' }}>
            API Test Panel
          </h2>
          {isMobile && (
            <button
              onClick={() => setPanelOpen(false)}
              style={{
                padding: '5px 10px',
                backgroundColor: 'transparent',
                color: 'white',
                border: '1px solid #666',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              ✕
            </button>
          )}
        </div>
        
        {/* Status */}
        <div
          style={{
            padding: isMobile ? '12px' : '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '4px',
            marginBottom: isMobile ? '15px' : '20px',
            minHeight: isMobile ? '50px' : '40px',
            fontSize: isMobile ? '12px' : '12px',
            lineHeight: isMobile ? '1.5' : '1.4',
          }}
        >
          <strong>Status:</strong> {status}
        </div>

        {/* File Uploads */}
        <div style={{ marginBottom: isMobile ? '15px' : '20px' }}>
          <h3 style={{ color: '#FFC107', marginTop: 0, fontSize: isMobile ? '13px' : '14px' }}>File Uploads</h3>
          
          {/* Model Upload */}
          <div style={{ marginBottom: isMobile ? '12px' : '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: isMobile ? '12px' : '11px' }}>
              Model (GLB) *
            </label>
            <input
              type="file"
              accept=".glb"
              onChange={handleModelUpload}
              style={{
                width: '100%',
                padding: isMobile ? '12px' : '8px',
                fontSize: isMobile ? '14px' : '11px',
                backgroundColor: '#333',
                color: 'white',
                border: '1px solid #555',
                borderRadius: '4px',
                cursor: 'pointer',
                minHeight: isMobile ? '44px' : 'auto', // Touch-friendly height
              }}
            />
            {modelFile && (
              <div style={{ fontSize: '10px', color: '#4CAF50', marginTop: '5px' }}>
                ✓ {modelFile.name}
              </div>
            )}
          </div>

          {/* Artwork Texture Upload */}
          <div style={{ marginBottom: isMobile ? '12px' : '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: isMobile ? '12px' : '11px' }}>
              Artwork Texture *
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleArtworkUpload}
              style={{
                width: '100%',
                padding: isMobile ? '12px' : '8px',
                fontSize: isMobile ? '14px' : '11px',
                backgroundColor: '#333',
                color: 'white',
                border: '1px solid #555',
                borderRadius: '4px',
                cursor: 'pointer',
                minHeight: isMobile ? '44px' : 'auto', // Touch-friendly height
              }}
            />
            {artworkFile && (
              <div style={{ fontSize: '10px', color: '#4CAF50', marginTop: '5px' }}>
                ✓ {artworkFile.name}
              </div>
            )}
          </div>

          {/* Frame Texture Upload (Optional) */}
          <div style={{ marginBottom: isMobile ? '12px' : '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: isMobile ? '12px' : '11px' }}>
              Frame Texture (Optional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFrameUpload}
              style={{
                width: '100%',
                padding: isMobile ? '12px' : '8px',
                fontSize: isMobile ? '14px' : '11px',
                backgroundColor: '#333',
                color: 'white',
                border: '1px solid #555',
                borderRadius: '4px',
                cursor: 'pointer',
                minHeight: isMobile ? '44px' : 'auto', // Touch-friendly height
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
          <h3 style={{ color: '#FFC107', marginTop: 0, fontSize: isMobile ? '13px' : '14px' }}>Material Type</h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', 
            gap: isMobile ? '8px' : '5px' 
          }}>
            {['ACRYLIC', 'METAL', 'METAL_BOX', 'WOOD', 'MIRROR'].map((type) => (
              <button
                key={type}
                onClick={() => handleMaterialChange(type)}
                style={{
                  padding: isMobile ? '12px' : '8px',
                  backgroundColor: materialType === type ? '#4CAF50' : '#666',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: isMobile ? '12px' : '11px',
                  minHeight: isMobile ? '44px' : 'auto', // Touch-friendly height
                }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Mode Selection */}
        <div style={{ marginBottom: isMobile ? '15px' : '20px' }}>
          <h3 style={{ color: '#FFC107', marginTop: 0, fontSize: isMobile ? '13px' : '14px' }}>Mode</h3>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button
              onClick={() => {
                viewerRef.current?.setMode('fullBleed');
                setCurrentMode('fullBleed');
              }}
              style={{
                flex: 1,
                padding: isMobile ? '14px' : '10px',
                backgroundColor: currentMode === 'fullBleed' ? '#2196F3' : '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: isMobile ? '14px' : '12px',
                minHeight: isMobile ? '44px' : 'auto', // Touch-friendly height
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
                padding: isMobile ? '14px' : '10px',
                backgroundColor: currentMode === 'shrunk' ? '#2196F3' : '#666',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: isMobile ? '14px' : '12px',
                minHeight: isMobile ? '44px' : 'auto', // Touch-friendly height
              }}
            >
              Shrunk
            </button>
          </div>
        </div>

        {/* Setup Button */}
        <div style={{ marginBottom: isMobile ? '15px' : '20px' }}>
          <button
            onClick={handleSetup}
            disabled={isLoading || !modelFile || !artworkUrl}
            style={{
              width: '100%',
              padding: isMobile ? '16px' : '12px',
              backgroundColor: (!modelFile || !artworkUrl) ? '#555' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!modelFile || !artworkUrl) ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: isMobile ? '16px' : '14px',
              minHeight: isMobile ? '48px' : 'auto', // Touch-friendly height
            }}
          >
            {isLoading ? 'Loading...' : 'Setup Scene'}
          </button>
        </div>

        {/* Update Controls */}
        <div style={{ marginBottom: isMobile ? '15px' : '20px' }}>
          <h3 style={{ color: '#FFC107', marginTop: 0, fontSize: isMobile ? '13px' : '14px' }}>Update Textures</h3>
          <button
            onClick={handleUpdateArtwork}
            disabled={isLoading || !artworkUrl}
            style={{
              width: '100%',
              padding: isMobile ? '14px' : '10px',
              marginBottom: '5px',
              backgroundColor: (!artworkUrl) ? '#555' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!artworkUrl) ? 'not-allowed' : 'pointer',
              fontSize: isMobile ? '14px' : '12px',
              minHeight: isMobile ? '44px' : 'auto', // Touch-friendly height
            }}
          >
            Update Artwork
          </button>
          <button
            onClick={handleUpdateFrame}
            disabled={isLoading || !frameUrl}
            style={{
              width: '100%',
              padding: isMobile ? '14px' : '10px',
              marginBottom: '5px',
              backgroundColor: (!frameUrl) ? '#555' : '#9C27B0',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!frameUrl) ? 'not-allowed' : 'pointer',
              fontSize: isMobile ? '14px' : '12px',
              minHeight: isMobile ? '44px' : 'auto', // Touch-friendly height
            }}
          >
            Update Frame
          </button>
        </div>

        {/* Mode Switch */}
        <div style={{ marginBottom: isMobile ? '15px' : '20px' }}>
          <button
            onClick={handleSwitchMode}
            disabled={isLoading}
            style={{
              width: '100%',
              padding: isMobile ? '14px' : '10px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: isMobile ? '14px' : '12px',
              minHeight: isMobile ? '44px' : 'auto', // Touch-friendly height
            }}
          >
            Switch Mode ({currentMode === 'fullBleed' ? 'Shrunk' : 'Full Bleed'})
          </button>
        </div>

        {/* Info */}
        <div
          style={{
            padding: isMobile ? '12px' : '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '4px',
            fontSize: isMobile ? '11px' : '10px',
            color: '#aaa',
            marginTop: 'auto',
            lineHeight: isMobile ? '1.6' : '1.5',
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
