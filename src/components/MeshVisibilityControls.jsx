import { UI_CONFIG } from "../config/appConfig.jsx";

/**
 * Mesh visibility controls component
 * Shows ALL meshes in the loaded model with individual visibility toggles.
 * Relationships (fullBleed/shrunk/frame, etc.) are still enforced by MeshVisibilityManager.
 */
export default function MeshVisibilityControls({ meshes, onToggleVisibility }) {
  if (!meshes || meshes.length === 0) {
    return (
      <div
        style={{
          padding: 10,
          textAlign: "center",
          opacity: 0.7,
          fontSize: 11,
        }}
      >
        No meshes found
      </div>
    );
  }

  // Keep a stable sort so list is easy to read: backs last, everything else alphabetical
  const sortedMeshes = [...meshes].sort((a, b) => {
    const aIsBack = (a.meshType || "").toLowerCase().includes("back");
    const bIsBack = (b.meshType || "").toLowerCase().includes("back");
    if (aIsBack && !bIsBack) return 1;
    if (!aIsBack && bIsBack) return -1;
    const nameA = (a.name || "").toLowerCase();
    const nameB = (b.name || "").toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return (
    <div style={{ padding: "8px 0", maxHeight: 260, overflowY: "auto" }}>
      {sortedMeshes.map((mesh) => {
        const isVisible = !!mesh.visible;
        const typeLabel = mesh.meshType || "other";

        return (
          <div
            key={mesh.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 8px",
              marginBottom: 4,
              borderRadius: 4,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontSize: 11,
            }}
          >
            <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
              <div
                style={{
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={mesh.name || mesh.id}
              >
                {mesh.name || mesh.id}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 10,
                  opacity: 0.7,
                }}
              >
                {typeLabel}
              </div>
            </div>

            <button
              onClick={() => onToggleVisibility(mesh.id)}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: 0,
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                background: isVisible
                  ? UI_CONFIG.colors.success
                  : UI_CONFIG.colors.disabled,
                color: "#fff",
                minWidth: 64,
                textAlign: "center",
              }}
            >
              {isVisible ? "ON" : "OFF"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
