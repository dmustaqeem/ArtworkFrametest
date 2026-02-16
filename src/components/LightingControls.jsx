import { LIGHTING_CONTROLS, UI_CONFIG } from "../config/appConfig.jsx";

/**
 * Lighting controls component
 */
export default function LightingControls({
  lighting,
  onLightingChange,
  onReset,
  lightingManagerRef,
  sceneManagerRef,
  materialModuleRef,
  detectedMaterialType,
}) {
  return (
    <>
      <div style={{
        marginBottom: 12,
        padding: 8,
        background: UI_CONFIG.colors.background.light,
        borderRadius: 4,
        fontSize: 11,
        opacity: 0.8
      }}>
        WhiteWall-style: Studio HDRI environment + minimal lights
      </div>
      
      {LIGHTING_CONTROLS.map((s) => (
        <div key={s.key} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, opacity: 0.9 }}>
            <span>{s.label}</span>
            <span>{lighting[s.key].toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={lighting[s.key]}
            onChange={(e) => {
              const newValue = parseFloat(e.target.value);
              // Always update through the callback to ensure state syncs
              onLightingChange({ [s.key]: newValue });
              // Also update SceneManager exposure if it's the exposure slider
              if (s.key === "exposure" && sceneManagerRef?.current) {
                sceneManagerRef.current.setToneMappingExposure(newValue);
              }
            }}
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: 9, opacity: 0.6, marginTop: 2 }}>
            {s.desc}
          </div>
        </div>
      ))}

      {/* Acrylic-only: Super-white base brightness */}
      {detectedMaterialType === "ACRYLIC" && (
        <div style={{ marginTop: 8, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, opacity: 0.9 }}>
            <span>White Base Brightness</span>
            <span style={{ fontSize: 11, opacity: 0.7 }}>
              {(lighting.acrylicBase ?? 1.5).toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={3.0}
            step={0.01}
            value={lighting.acrylicBase ?? 1.5}
            onChange={(e) => {
              const newValue = parseFloat(e.target.value);

              // Update lighting state so value is persisted with lighting presets
              if (onLightingChange) {
                onLightingChange({ acrylicBase: newValue });
              }

              // Also directly update the acrylic base meshes in the scene
              // For MeshStandardMaterial, we use emissiveIntensity
              const scene = sceneManagerRef?.current?.getScene
                ? sceneManagerRef.current.getScene()
                : null;

              if (scene) {
                scene.traverse((obj) => {
                  if (
                    obj.isMesh &&
                    obj.userData &&
                    obj.userData.isAcrylicEmissiveBase &&
                    obj.material
                  ) {
                    const mats = Array.isArray(obj.material)
                      ? obj.material
                      : [obj.material];
                    mats.forEach((m) => {
                      if (m) {
                        // MeshStandardMaterial uses emissiveIntensity
                        if (m.emissiveIntensity !== undefined) {
                          m.emissiveIntensity = newValue;
                          // Ensure toneMapped stays false to prevent greying
                          m.toneMapped = false;
                        } else if (m.isMeshBasicMaterial && m.color) {
                          // Fallback for old MeshBasicMaterial (if any exist)
                          m.color.setScalar(newValue);
                        }
                        m.needsUpdate = true;
                      }
                    });
                  }
                });

                const renderer = sceneManagerRef.current?.getRenderer
                  ? sceneManagerRef.current.getRenderer()
                  : null;
                const camera = sceneManagerRef.current?.getCamera
                  ? sceneManagerRef.current.getCamera()
                  : null;
                // Animation loop handles rendering automatically - no need for manual render
              }
            }}
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: 9, opacity: 0.6, marginTop: 2 }}>
            Controls brightness of the super-white backing layer under acrylic artwork
          </div>
        </div>
      )}

      {/* Reflection Intensity Control */}
      <div style={{ marginTop: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, opacity: 0.9 }}>
          <span>Reflection Intensity</span>
          <span style={{ fontSize: 11, opacity: 0.7 }}>
            {lighting.reflectionIntensity?.toFixed(2) || "1.00"}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={2}
          step={0.01}
          value={lighting.reflectionIntensity || 1.0}
          onChange={(e) => {
            const newValue = parseFloat(e.target.value);
            if (onLightingChange) {
              onLightingChange({ reflectionIntensity: newValue });
            }
          }}
          style={{ width: "100%" }}
        />
        <div style={{ fontSize: 9, opacity: 0.6, marginTop: 2 }}>
          Controls the intensity of environment map reflections
        </div>
      </div>

      {/* Material-specific controls - Hidden to avoid duplication with general reflection intensity control */}
      {/* Material-specific controls (like metal finish/color) can be added here if needed in the future */}

      {/* Reset Button */}
      <button
        onClick={onReset}
        style={{
          width: "100%",
          padding: 10,
          border: 0,
          borderRadius: 6,
          background: UI_CONFIG.colors.warning,
          color: "white",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: 12,
          marginTop: 8,
        }}
        onMouseEnter={(e) => {
          e.target.style.background = "#fb8c00";
        }}
        onMouseLeave={(e) => {
          e.target.style.background = UI_CONFIG.colors.warning;
        }}
      >
        Reset to Default
      </button>
    </>
  );
}
