import { UI_CONFIG } from "../config/appConfig.jsx";

/**
 * Simplified mesh visibility controls component
 * Shows only two mode buttons: Full Bleed and Shrunk
 * Automatically handles all mesh relationships
 */
export default function MeshVisibilityControls({
  meshes,
  onToggleVisibility,
}) {
  if (meshes.length === 0) {
    return (
      <div style={{ padding: 10, textAlign: "center", opacity: 0.7, fontSize: 11 }}>
        No meshes found
      </div>
    );
  }

  // Find Artwork_FullBleed and Artwork_Shrunk meshes to determine current mode
  const artworkFullBleed = meshes.find(m => 
    m.meshType === "fullBleed" || 
    (m.name && m.name.toLowerCase().includes("artwork") && m.name.toLowerCase().includes("fullbleed"))
  );
  
  const artworkShrunk = meshes.find(m => 
    m.meshType === "shrunk" || 
    (m.name && m.name.toLowerCase().includes("artwork") && m.name.toLowerCase().includes("shrunk"))
  );

  // Determine current mode: fullBleed if Artwork_FullBleed is visible, shrunk if Artwork_Shrunk is visible
  const isFullBleedMode = artworkFullBleed && artworkFullBleed.visible;
  const isShrunkMode = artworkShrunk && artworkShrunk.visible;

  // Handler for mode switching
  const handleModeSwitch = (mode) => {
    if (mode === "fullBleed" && artworkFullBleed) {
      // Switch to fullBleed: Turn ON Artwork_FullBleed (this will automatically handle all related meshes)
      if (!artworkFullBleed.visible) {
        onToggleVisibility(artworkFullBleed.id);
      }
    } else if (mode === "shrunk" && artworkShrunk) {
      // Switch to shrunk: Turn ON Artwork_Shrunk (this will automatically handle frame and shrunk meshes)
      if (!artworkShrunk.visible) {
        onToggleVisibility(artworkShrunk.id);
      }
    }
  };

  return (
    <div style={{ padding: "10px 0" }}>
      <div style={{ 
        display: "flex", 
        gap: 10, 
        flexDirection: "column"
      }}>
        <button
          onClick={() => handleModeSwitch("fullBleed")}
          disabled={!artworkFullBleed}
          style={{
            width: "100%",
            padding: "12px",
            border: 0,
            borderRadius: 6,
            background: isFullBleedMode ? UI_CONFIG.colors.success : UI_CONFIG.colors.disabled,
            color: "white",
            cursor: artworkFullBleed ? "pointer" : "not-allowed",
            fontSize: 12,
            fontWeight: 600,
            transition: "background 0.2s",
          }}
        >
          {isFullBleedMode ? "✓ Full Bleed Mode" : "Full Bleed Mode"}
        </button>
        
        <button
          onClick={() => handleModeSwitch("shrunk")}
          disabled={!artworkShrunk}
          style={{
            width: "100%",
            padding: "12px",
            border: 0,
            borderRadius: 6,
            background: isShrunkMode ? UI_CONFIG.colors.success : UI_CONFIG.colors.disabled,
            color: "white",
            cursor: artworkShrunk ? "pointer" : "not-allowed",
            fontSize: 12,
            fontWeight: 600,
            transition: "background 0.2s",
          }}
        >
          {isShrunkMode ? "✓ Shrunk Mode" : "Shrunk Mode"}
        </button>
      </div>
      
      <div style={{ 
        marginTop: 12, 
        padding: 8, 
        background: "rgba(255,255,255,0.05)", 
        borderRadius: 4,
        fontSize: 10,
        opacity: 0.7,
        textAlign: "center"
      }}>
        {isFullBleedMode && "Artwork extends to edges"}
        {isShrunkMode && "Artwork with frame visible"}
        {!isFullBleedMode && !isShrunkMode && "Select a mode"}
      </div>
    </div>
  );
}
