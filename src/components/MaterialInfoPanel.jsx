import { UI_CONFIG } from "../config/appConfig.jsx";

/**
 * Material info panel component (bottom left)
 */
export default function MaterialInfoPanel({
  materialSummary,
  detectedMaterialType,
  style = {},
}) {
  if (!materialSummary) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: UI_CONFIG.materialInfoPanel.position.left,
        bottom: UI_CONFIG.materialInfoPanel.position.bottom,
        maxWidth: UI_CONFIG.materialInfoPanel.maxWidth,
        background: UI_CONFIG.materialInfoPanel.background,
        color: UI_CONFIG.materialInfoPanel.color,
        padding: UI_CONFIG.materialInfoPanel.padding,
        borderRadius: UI_CONFIG.materialInfoPanel.borderRadius,
        zIndex: UI_CONFIG.materialInfoPanel.zIndex,
        fontFamily: "monospace",
        fontSize: 11,
        ...style,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        Material Summary
      </div>
      <div style={{ opacity: 0.9 }}>
        <div>Type: {detectedMaterialType || "Unknown"}</div>
        <div>Meshes: {materialSummary.totalMeshes}</div>
        <div>Materials: {materialSummary.totalMaterials}</div>
        {Object.keys(materialSummary.byType).length > 0 && (
          <div style={{ marginTop: 4, fontSize: 10, opacity: 0.8 }}>
            {Object.entries(materialSummary.byType).map(([type, count]) => (
              <div key={type}>
                {type}: {count}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
