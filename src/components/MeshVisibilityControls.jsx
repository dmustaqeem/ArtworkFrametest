import { MESH_TYPE_COLORS, UI_CONFIG } from "../config/appConfig.jsx";

/**
 * Mesh visibility controls component
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

  // Filter out Wood_Back, Mirror_Back, WhiteMetal_Back, and SilverMetal_Back from display (always on, no need to show as option)
  const visibleMeshes = meshes.filter(m => m.meshType !== "woodBack" && m.meshType !== "mirrorBack" && 
                                          m.meshType !== "whiteMetalBack" && m.meshType !== "silverMetalBack");

  return (
    <div style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: 4 }}>
      {visibleMeshes.map((mesh, index) => (
        <div
          key={mesh.id}
          style={{
            marginBottom: 6,
            padding: 8,
            background: UI_CONFIG.colors.background.light,
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 2, wordBreak: "break-word", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span>{index + 1}. {mesh.name || "Unnamed Mesh"}</span>
              {mesh.meshType && mesh.meshType !== "other" && (
                <span style={{
                  fontSize: 8,
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: MESH_TYPE_COLORS[mesh.meshType] || "#666",
                  opacity: 0.8,
                  fontWeight: 700
                }}>
                  {mesh.meshType === "fullBleed" ? "Full Bleed" : 
                   mesh.meshType === "silverFullBleed" ? "Silver Full Bleed" :
                   mesh.meshType === "whiteMetalFullBleed" ? "White Metal Full Bleed" :
                   mesh.meshType === "woodFullBleed" ? "Wood Full Bleed" :
                   mesh.meshType === "mirrorFullBleed" ? "Mirror Full Bleed" :
                   mesh.meshType === "shrunk" ? "Shrunk" : 
                   mesh.meshType === "silverShrunk" ? "Silver Shrunk" :
                   mesh.meshType === "whiteMetalShrunk" ? "White Metal Shrunk" :
                   mesh.meshType === "woodShrunk" ? "Wood Shrunk" :
                   mesh.meshType === "mirrorShrunk" ? "Mirror Shrunk" :
                   mesh.meshType === "frame" ? "Frame" :
                   mesh.meshType === "back" || mesh.meshType === "woodBack" || mesh.meshType === "mirrorBack" || 
                   mesh.meshType === "whiteMetalBack" || mesh.meshType === "silverMetalBack" ? "Back" : "Other"}
                </span>
              )}
            </div>
            <div style={{ fontSize: 9, opacity: 0.7, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span>{mesh.visible ? "✓ Visible" : "✗ Hidden"}</span>
              {mesh.hasMaterial !== undefined && (
                <span>{mesh.hasMaterial ? "• Has Material" : "• No Material"}</span>
              )}
            </div>
          </div>
          <button
            onClick={() => onToggleVisibility(mesh.id)}
            disabled={mesh.meshType === "back" || mesh.meshType === "woodBack" || mesh.meshType === "mirrorBack" || 
                      mesh.meshType === "whiteMetalBack" || mesh.meshType === "silverMetalBack"} // Disable toggle for back meshes (always ON)
            style={{
              padding: "6px 12px",
              border: 0,
              borderRadius: 4,
              background: (mesh.meshType === "back" || mesh.meshType === "woodBack" || mesh.meshType === "mirrorBack" || 
                          mesh.meshType === "whiteMetalBack" || mesh.meshType === "silverMetalBack")
                ? "#4CAF50" // Always green for back (always ON)
                : (mesh.visible ? UI_CONFIG.colors.success : UI_CONFIG.colors.disabled),
              color: "white",
              cursor: (mesh.meshType === "back" || mesh.meshType === "woodBack" || mesh.meshType === "mirrorBack" || 
                      mesh.meshType === "whiteMetalBack" || mesh.meshType === "silverMetalBack") ? "not-allowed" : "pointer",
              fontSize: 10,
              fontWeight: 600,
              minWidth: 60,
              marginLeft: 8,
              flexShrink: 0,
              opacity: (mesh.meshType === "back" || mesh.meshType === "woodBack" || mesh.meshType === "mirrorBack" || 
                       mesh.meshType === "whiteMetalBack" || mesh.meshType === "silverMetalBack") ? 0.7 : 1,
            }}
            title={(mesh.meshType === "back" || mesh.meshType === "woodBack" || mesh.meshType === "mirrorBack" || 
                    mesh.meshType === "whiteMetalBack" || mesh.meshType === "silverMetalBack") ? "Back mesh is always visible" : undefined}
          >
            {(mesh.meshType === "back" || mesh.meshType === "woodBack" || mesh.meshType === "mirrorBack" || 
              mesh.meshType === "whiteMetalBack" || mesh.meshType === "silverMetalBack") ? "ON" : (mesh.visible ? "ON" : "OFF")}
          </button>
        </div>
      ))}
    </div>
  );
}
