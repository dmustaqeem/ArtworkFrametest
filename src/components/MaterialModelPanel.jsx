import { useState, useEffect } from "react";
import { MATERIAL_MODULES } from "../materials/index.js";
import { MODEL_PATHS } from "../config/appConfig.jsx";

/**
 * MaterialModelPanel Component
 * Separate interactive panel for selecting material type and model
 * Positioned separately from main controls to avoid overcrowding
 */
export default function MaterialModelPanel({ 
  activeMaterialType, 
  selectedModelPath,
  metalColor, // Current metal color ("brushed_silver" or "white")
  onMaterialTypeChange,
  onModelSelect,
  style = {} 
}) {
  // Determine display type from activeMaterialType and metalColor
  const getDisplayType = (type, color) => {
    if (type === "METAL" || type === "METAL_BOX") {
      if (color === "white") return "METAL_WHITE";
      return "METAL_SILVER"; // Default to silver
    }
    return type;
  };
  
  const initialDisplayType = (() => {
    if (activeMaterialType === "METAL" || activeMaterialType === "METAL_BOX") {
      if (metalColor === "white") return "METAL_WHITE";
      return "METAL_SILVER";
    }
    return activeMaterialType || "ACRYLIC";
  })();
  
  const [selectedTab, setSelectedTab] = useState(initialDisplayType);
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Map material types to their folder paths and available models
  // Updated to match actual supported types: Acrylic, Metal White, Metal Silver, Wood, Mirror
  const MATERIAL_MODEL_MAP = {
    ACRYLIC: {
      folder: "Acrylic",
      models: [
        { name: "Acrylic 450x675", path: "/assets/models/Acrylic/Acrylic_450x675.glb" },
        // Add more acrylic models here as they're added to the folder
      ],
    },
    METAL_SILVER: {
      folder: "Metal Silver",
      models: [
        { name: "Metal Silver 450x675", path: "/assets/models/Metal Silver/Metal_Silver_450x675.glb" },
        { name: "Metal Box Silver 400x600", path: "/assets/models/Metal Silver/Metal_Box_Silver_400x600.glb" },
        { name: "Metal Box Silver 450x675", path: "/assets/models/Metal Silver/Metal_Box_Silver_450x675.glb" },
      ],
    },
    METAL_WHITE: {
      folder: "Metal White",
      models: [
        { name: "Metal White 450x675", path: "/assets/models/Metal White/Metal_White_450x675.glb" },
        { name: "Metal Box White 450x675", path: "/assets/models/Metal White/Metal_Box_White_450x675.glb" },
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

  // Map user-friendly material types to internal types
  const MATERIAL_TYPE_MAP = {
    ACRYLIC: "ACRYLIC",
    "METAL_SILVER": "METAL", // Use METAL module for silver
    "METAL_WHITE": "METAL", // Use METAL module for white
    WOOD: "WOOD",
    MIRROR: "MIRROR",
  };

  // Get display name for material type
  const getMaterialDisplayName = (type) => {
    const names = {
      ACRYLIC: "Acrylic",
      METAL_SILVER: "Metal Silver",
      METAL_WHITE: "Metal White",
      WOOD: "Wood",
      MIRROR: "Mirror",
    };
    return names[type] || type;
  };

  // Get icon for material type
  const getMaterialIcon = (type) => {
    if (type === "METAL_SILVER" || type === "METAL_WHITE") {
      return MATERIAL_MODULES.METAL.icon;
    }
    return MATERIAL_MODULES[type]?.icon || "📦";
  };

  // Get description for material type
  const getMaterialDescription = (type) => {
    if (type === "METAL_SILVER") {
      return "HD print on brushed silver aluminum - Super-matt finish";
    }
    if (type === "METAL_WHITE") {
      return "HD print on white aluminum - Super-matt finish";
    }
    return MATERIAL_MODULES[MATERIAL_TYPE_MAP[type]]?.description || "";
  };

  // Auto-select first model on initial mount if no model is selected
  useEffect(() => {
    if (!selectedModelPath && onModelSelect) {
      const models = MATERIAL_MODEL_MAP[selectedTab]?.models || [];
      const firstModel = models[0];
      if (firstModel) {
        const internalType = MATERIAL_TYPE_MAP[selectedTab];
        onModelSelect(firstModel.path, internalType, selectedTab);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Update selected tab when activeMaterialType or metalColor changes externally
  useEffect(() => {
    const displayType = getDisplayType(activeMaterialType || "ACRYLIC", metalColor);
    if (displayType !== selectedTab) {
      setSelectedTab(displayType);
      
      // Auto-select first model when tab changes externally (if current model doesn't belong to new type)
      const models = MATERIAL_MODEL_MAP[displayType]?.models || [];
      const firstModel = models[0];
      if (firstModel && onModelSelect && (!selectedModelPath || !models.some(m => m.path === selectedModelPath))) {
        const internalType = MATERIAL_TYPE_MAP[displayType];
        onModelSelect(firstModel.path, internalType, displayType);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMaterialType, metalColor]);

  const handleTabClick = (materialType) => {
    // Prevent rapid clicking on the same tab
    if (selectedTab === materialType) {
      return; // Already selected
    }
    
    setSelectedTab(materialType);
    // Map to internal material type
    const internalType = MATERIAL_TYPE_MAP[materialType];
    
    // ✅ Don't auto-select model or trigger setup - just change the tab
    // User must manually select a model and click "Setup Scene" button
    // This prevents automatic scene reconfiguration when just browsing material types
    
    // Only notify parent of material type change (without triggering setup)
    if (onMaterialTypeChange && internalType) {
      setTimeout(() => {
        onMaterialTypeChange(internalType, materialType);
      }, 0);
    }
  };

  const handleModelClick = (modelPath) => {
    if (onModelSelect) {
      // Pass both internal type and display type
      const internalType = MATERIAL_TYPE_MAP[selectedTab];
      onModelSelect(modelPath, internalType, selectedTab);
    }
  };

  const materialTypes = ["ACRYLIC", "METAL_SILVER", "METAL_WHITE", "WOOD", "MIRROR"];
  const currentModels = MATERIAL_MODEL_MAP[selectedTab]?.models || [];

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: 16,
        width: 320,
        maxHeight: "90vh",
        background: "rgba(0,0,0,0.9)",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.15)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        zIndex: 1000,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      {/* Header with collapse button */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div style={{ fontWeight: 700, fontSize: 13, color: "white", letterSpacing: 0.5 }}>
          Material & Model Selector
        </div>
        <div style={{ fontSize: 18, color: "rgba(255,255,255,0.7)" }}>
          {isCollapsed ? "▼" : "▲"}
        </div>
      </div>

      {!isCollapsed && (
        <div
          style={{
            padding: 16,
            overflowY: "auto",
            maxHeight: "calc(90vh - 60px)",
          }}
        >
          {/* Material Type Tabs */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "rgba(255,255,255,0.7)",
                marginBottom: 10,
                textTransform: "uppercase",
                letterSpacing: 1.2,
              }}
            >
              Material Type
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 6,
              }}
            >
              {materialTypes.map((type) => {
                const isActive = selectedTab === type;
                
                return (
                  <button
                    key={type}
                    onClick={() => handleTabClick(type)}
                    style={{
                      padding: "14px 8px",
                      border: 0,
                      borderRadius: 8,
                      background: isActive
                        ? "linear-gradient(135deg, #4CAF50 0%, #45a049 100%)"
                        : "rgba(255,255,255,0.1)",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: isActive ? 700 : 500,
                      fontSize: 10,
                      transition: "all 0.2s ease",
                      boxShadow: isActive
                        ? "0 2px 8px rgba(76, 175, 80, 0.4)"
                        : "none",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
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
                    <span style={{ fontSize: 20, filter: isActive ? "none" : "opacity(0.7)" }}>
                      {getMaterialIcon(type)}
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
                      {getMaterialDisplayName(type)}
                    </span>
                    {isActive && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: 2,
                          left: "50%",
                          transform: "translateX(-50%)",
                          width: "70%",
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
            {selectedTab && (
              <div
                style={{
                  marginTop: 12,
                  fontSize: 10,
                  color: "rgba(255,255,255,0.6)",
                  fontStyle: "italic",
                  lineHeight: 1.4,
                  padding: "10px 12px",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: 6,
                }}
              >
                {getMaterialDescription(selectedTab)}
              </div>
            )}
          </div>

          {/* Model Selection */}
          {currentModels.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.7)",
                  marginBottom: 10,
                  textTransform: "uppercase",
                  letterSpacing: 1.2,
                }}
              >
                Available Models ({currentModels.length})
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
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
                        padding: "14px 12px",
                        border: isSelected 
                          ? "2px solid #4CAF50" 
                          : "1px solid rgba(255,255,255,0.2)",
                        borderRadius: 8,
                        background: isSelected
                          ? "rgba(76, 175, 80, 0.15)"
                          : "rgba(255,255,255,0.05)",
                        color: "white",
                        cursor: "pointer",
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: 11,
                        transition: "all 0.2s ease",
                        textAlign: "left",
                        position: "relative",
                        overflow: "hidden",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.target.style.background = "rgba(255,255,255,0.1)";
                          e.target.style.borderColor = "rgba(255,255,255,0.3)";
                          e.target.style.transform = "translateX(2px)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.target.style.background = "rgba(255,255,255,0.05)";
                          e.target.style.borderColor = "rgba(255,255,255,0.2)";
                          e.target.style.transform = "translateX(0)";
                        }
                      }}
                    >
                      {isSelected && (
                        <div
                          style={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            width: 20,
                            height: 20,
                            background: "#4CAF50",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          ✓
                        </div>
                      )}
                      <div style={{ 
                        fontSize: 12, 
                        marginBottom: 4,
                        fontWeight: isSelected ? 700 : 600,
                        paddingRight: isSelected ? 30 : 0,
                      }}>
                        {model.name}
                      </div>
                      <div style={{ 
                        fontSize: 9, 
                        opacity: 0.6,
                        wordBreak: "break-word",
                        fontFamily: "monospace",
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
              No models available for {getMaterialDisplayName(selectedTab)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
