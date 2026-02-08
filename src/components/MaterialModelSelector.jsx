import { useState, useEffect } from "react";
import { MATERIAL_MODULES } from "../materials/index.js";

/**
 * MaterialModelSelector Component
 * Provides a tabbed interface for selecting material type and then model
 */
export default function MaterialModelSelector({ 
  activeMaterialType, 
  selectedModelPath,
  onMaterialTypeChange,
  onModelSelect,
  style = {} 
}) {
  const [selectedTab, setSelectedTab] = useState(activeMaterialType || "ACRYLIC");
  
  // Map material types to their folder paths and available models
  const MATERIAL_MODEL_MAP = {
    ACRYLIC: {
      folder: "Acrylic",
      models: [
        { name: "Acrylic 450x675", path: "/assets/models/Acrylic/Acrylic_450x675.glb" },
        // Models in Acrylic folder will be added dynamically
        // Add more acrylic models here as they're added to the folder
      ],
    },
    METAL: {
      folder: "Metal Silver",
      models: [
        { name: "Metal Silver 450x675", path: "/assets/models/Metal Silver/Metal_Silver_450x675.glb" },
        { name: "Metal Box Silver 400x600", path: "/assets/models/Metal Silver/Metal_Box_Silver_400x600.glb" },
        { name: "Metal Box Silver 450x675", path: "/assets/models/Metal Silver/Metal_Box_Silver_450x675.glb" },
      ],
    },
    METAL_BOX: {
      folder: "Metal Silver",
      models: [
        { name: "Metal Box Silver 400x600", path: "/assets/models/Metal Silver/Metal_Box_Silver_400x600.glb" },
        { name: "Metal Box Silver 450x675", path: "/assets/models/Metal Silver/Metal_Box_Silver_450x675.glb" },
      ],
    },
    WOOD: {
      folder: "Wood",
      models: [
        { name: "Wood 450x675", path: "/assets/models/Wood/Wood_450x675.glb" },
      ],
    },
    MIRROR: {
      folder: "Mirror",
      models: [
        { name: "Mirror 450x675", path: "/assets/models/Mirror/Mirror_450x675.glb" },
      ],
    },
  };

  // Update selected tab when activeMaterialType changes externally
  useEffect(() => {
    if (activeMaterialType && activeMaterialType !== selectedTab) {
      setSelectedTab(activeMaterialType);
    }
  }, [activeMaterialType]);

  const handleTabClick = (materialType) => {
    setSelectedTab(materialType);
    if (onMaterialTypeChange) {
      onMaterialTypeChange(materialType);
    }
  };

  const handleModelClick = (modelPath) => {
    if (onModelSelect) {
      onModelSelect(modelPath, selectedTab);
    }
  };

  const materialTypes = Object.keys(MATERIAL_MODULES);
  const currentModels = MATERIAL_MODEL_MAP[selectedTab]?.models || [];
  
  // Auto-select first model if none selected and models are available
  useEffect(() => {
    if (!selectedModelPath && currentModels.length > 0 && onModelSelect) {
      // Don't auto-select on initial render - let the initial load handle it
    }
  }, [selectedTab, currentModels.length]);

  return (
    <div
      style={{
        marginBottom: 20,
        background: "rgba(0,0,0,0.3)",
        borderRadius: 8,
        padding: 16,
        border: "1px solid rgba(255,255,255,0.1)",
        ...style,
      }}
    >
      {/* Material Type Tabs */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(255,255,255,0.7)",
            marginBottom: 10,
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
            const isActive = selectedTab === type;
            
            return (
              <button
                key={type}
                onClick={() => handleTabClick(type)}
                style={{
                  flex: "1 1 auto",
                  minWidth: "70px",
                  padding: "12px 10px",
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
                    e.target.style.transform = "translateY(-1px)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.target.style.background = "rgba(255,255,255,0.1)";
                    e.target.style.transform = "translateY(0)";
                  }
                }}
              >
                <span style={{ fontSize: 18, filter: isActive ? "none" : "opacity(0.7)" }}>
                  {module.icon}
                </span>
                <span 
                  style={{ 
                    fontSize: 9, 
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
        {selectedTab && MATERIAL_MODULES[selectedTab] && (
          <div
            style={{
              marginTop: 10,
              fontSize: 10,
              color: "rgba(255,255,255,0.6)",
              fontStyle: "italic",
              lineHeight: 1.4,
              padding: "8px 12px",
              background: "rgba(255,255,255,0.05)",
              borderRadius: 4,
            }}
          >
            {MATERIAL_MODULES[selectedTab].description}
          </div>
        )}
      </div>

      {/* Model Selection */}
      {currentModels.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(255,255,255,0.7)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Available Models ({currentModels.length})
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 8,
            }}
          >
            {currentModels.map((model, index) => {
              const isSelected = selectedModelPath === model.path;
              
              return (
                <button
                  key={index}
                  onClick={() => handleModelClick(model.path)}
                  style={{
                    padding: "12px 10px",
                    border: isSelected 
                      ? "2px solid #4CAF50" 
                      : "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 6,
                    background: isSelected
                      ? "rgba(76, 175, 80, 0.2)"
                      : "rgba(255,255,255,0.05)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: isSelected ? 700 : 500,
                    fontSize: 10,
                    transition: "all 0.2s ease",
                    textAlign: "center",
                    position: "relative",
                    overflow: "hidden",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.target.style.background = "rgba(255,255,255,0.1)";
                      e.target.style.borderColor = "rgba(255,255,255,0.3)";
                      e.target.style.transform = "translateY(-2px)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.target.style.background = "rgba(255,255,255,0.05)";
                      e.target.style.borderColor = "rgba(255,255,255,0.2)";
                      e.target.style.transform = "translateY(0)";
                    }
                  }}
                >
                  {isSelected && (
                    <div
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        width: 16,
                        height: 16,
                        background: "#4CAF50",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                      }}
                    >
                      ✓
                    </div>
                  )}
                  <div style={{ 
                    fontSize: 11, 
                    marginBottom: 4,
                    fontWeight: isSelected ? 700 : 600,
                  }}>
                    {model.name}
                  </div>
                  <div style={{ 
                    fontSize: 9, 
                    opacity: 0.6,
                    wordBreak: "break-word",
                  }}>
                    {model.path.split("/").pop()}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {currentModels.length === 0 && (
        <div
          style={{
            padding: 20,
            textAlign: "center",
            color: "rgba(255,255,255,0.5)",
            fontSize: 11,
            fontStyle: "italic",
          }}
        >
          No models available for {MATERIAL_MODULES[selectedTab]?.name || selectedTab}
        </div>
      )}
    </div>
  );
}
