import { MATERIAL_MODULES } from "../materials/index.js";

/**
 * MaterialTypeTabs Component
 * Provides tabbed interface for switching between different material types
 */
export default function MaterialTypeTabs({ 
  activeMaterialType, 
  onMaterialTypeChange,
  style = {} 
}) {
  const materialTypes = Object.keys(MATERIAL_MODULES);
  
  return (
    <div
      style={{
        marginBottom: 16,
        borderBottom: "2px solid rgba(255,255,255,0.1)",
        paddingBottom: 12,
        ...style,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "rgba(255,255,255,0.7)",
          marginBottom: 8,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        Material Type
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        {materialTypes.map((type) => {
          const module = MATERIAL_MODULES[type];
          const isActive = activeMaterialType === type;
          
          return (
            <button
              key={type}
              onClick={() => onMaterialTypeChange(type)}
              style={{
                flex: "1 1 auto",
                minWidth: "80px",
                padding: "10px 12px",
                border: 0,
                borderRadius: 6,
                background: isActive
                  ? "linear-gradient(135deg, #4CAF50 0%, #45a049 100%)"
                  : "rgba(255,255,255,0.1)",
                color: "white",
                cursor: "pointer",
                fontWeight: isActive ? 700 : 500,
                fontSize: 11,
                transition: "all 0.2s ease",
                boxShadow: isActive
                  ? "0 2px 8px rgba(76, 175, 80, 0.4)"
                  : "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                position: "relative",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.target.style.background = "rgba(255,255,255,0.15)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.target.style.background = "rgba(255,255,255,0.1)";
                }
              }}
            >
              <span style={{ fontSize: 18, filter: isActive ? "none" : "opacity(0.7)" }}>
                {module.icon}
              </span>
              <span 
                style={{ 
                  fontSize: 10, 
                  textAlign: "center", 
                  lineHeight: 1.2,
                  opacity: isActive ? 1 : 0.8,
                  fontWeight: isActive ? 700 : 500,
                }}
              >
                {module.name.split(" ")[0]}
              </span>
              {isActive && (
                <div
                  style={{
                    position: "absolute",
                    bottom: -2,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "60%",
                    height: 2,
                    background: "#4CAF50",
                    borderRadius: 2,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
      {activeMaterialType && MATERIAL_MODULES[activeMaterialType] && (
        <div
          style={{
            marginTop: 8,
            fontSize: 10,
            color: "rgba(255,255,255,0.6)",
            fontStyle: "italic",
            lineHeight: 1.4,
          }}
        >
          {MATERIAL_MODULES[activeMaterialType].description}
        </div>
      )}
    </div>
  );
}
