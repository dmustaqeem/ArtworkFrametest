import { useEffect, useRef, useState } from "react";
import { getMaterialModule } from "../materials/index.js";
import { MATERIAL_CONFIG } from "../config/appConfig.jsx";

/**
 * Custom hook to manage material type state and logic
 */
export function useMaterialType(initialType = MATERIAL_CONFIG.DEFAULT_TYPE) {
  const [selectedMaterialType, setSelectedMaterialType] = useState(initialType);
  const [materialTypeOverride, setMaterialTypeOverride] = useState(null);
  const [detectedMaterialType, setDetectedMaterialType] = useState(null);
  
  // Compute active material type
  const activeMaterialType = materialTypeOverride || selectedMaterialType || MATERIAL_CONFIG.DEFAULT_TYPE;
  
  // Initialize metal color immediately based on material type (not in useEffect)
  const initialMetalColor = (activeMaterialType === "METAL" || activeMaterialType === "METAL_BOX") 
    ? MATERIAL_CONFIG.METAL_FINISH 
    : null;
  const [metalColor, setMetalColor] = useState(initialMetalColor);
  
  const activeMaterialTypeRef = useRef(null);
  const materialModuleRef = useRef(null);
  
  activeMaterialTypeRef.current = activeMaterialType;

  // Update detected material type
  useEffect(() => {
    setDetectedMaterialType(activeMaterialType);
  }, [activeMaterialType]);

  // Update metal color when material type changes
  useEffect(() => {
    if (activeMaterialType === "METAL" || activeMaterialType === "METAL_BOX") {
      setMetalColor(MATERIAL_CONFIG.METAL_FINISH);
    } else {
      setMetalColor(null);
    }
  }, [activeMaterialType]);

  // Get material module for active type
  const getActiveMaterialModule = () => {
    const module = getMaterialModule(activeMaterialType);
    if (module) {
      materialModuleRef.current = module;
    }
    return module;
  };

  return {
    selectedMaterialType,
    setSelectedMaterialType,
    materialTypeOverride,
    setMaterialTypeOverride,
    detectedMaterialType,
    setDetectedMaterialType,
    metalColor,
    setMetalColor,
    activeMaterialType,
    activeMaterialTypeRef,
    materialModuleRef,
    getActiveMaterialModule,
  };
}
