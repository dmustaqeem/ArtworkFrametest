import { useState, useEffect, useRef } from "react";
import { DEFAULT_LIGHTING, DEFAULT_STATE } from "../config/appConfig.jsx";

/**
 * Custom hook to manage lighting state and sync with LightingManager
 */
export function useLighting(lightingManagerRef) {
  const [lighting, setLighting] = useState(DEFAULT_LIGHTING);
  const [reflectionIntensity, setReflectionIntensity] = useState(DEFAULT_STATE.reflectionIntensity);
  const [metalFinish, setMetalFinish] = useState(DEFAULT_STATE.metalFinish);
  const [showLightingControls, setShowLightingControls] = useState(DEFAULT_STATE.showLightingControls);
  const [showReflections, setShowReflections] = useState(DEFAULT_STATE.showReflections);

  // Set up callbacks to sync state when LightingManager is available
  useEffect(() => {
    // If manager not ready, check again soon
    if (!lightingManagerRef?.current) {
      const timeoutId = setTimeout(() => {
        // Force re-run by updating a state that triggers re-render
        setLighting((prev) => ({ ...prev }));
      }, 100);
      return () => clearTimeout(timeoutId);
    }

    // Register callback for lighting changes - update state directly to avoid loop
    // IMPORTANT: This callback must NOT call updateLighting, only setLighting directly
    const handleLightingChange = (newLighting) => {
      // Update state - use functional update to merge with any pending updates
      setLighting((prev) => {
        // Only update if values actually changed to avoid unnecessary re-renders
        const hasChanged = Object.keys(newLighting).some(
          key => Math.abs((prev[key] || 0) - (newLighting[key] || 0)) > 0.0001
        );
        return hasChanged ? { ...prev, ...newLighting } : prev;
      });
    };

    lightingManagerRef.current.onLightingChange(handleLightingChange);

    // Initial sync
    const currentLighting = lightingManagerRef.current.getLighting();
    setLighting({ ...currentLighting });

    // Cleanup: Note - we don't remove callbacks as they're needed for the lifetime of the component
  }, [lightingManagerRef]); // Re-check when ref changes

  /**
   * Update lighting through LightingManager
   */
  const updateLighting = (newLighting) => {
    // Extract reflectionIntensity if present (it's separate state)
    const { 
      reflectionIntensity: newReflectionIntensity,
      ...lightingUpdate 
    } = newLighting;
    
    // Update lighting state immediately for responsive UI
    setLighting((prev) => ({ ...prev, ...lightingUpdate }));
    
    // Update reflectionIntensity state if provided
    if (newReflectionIntensity !== undefined) {
      setReflectionIntensity(newReflectionIntensity);
    }
    
    // Also update LightingManager if available (this will trigger callbacks)
    // Only pass lighting properties, not reflectionIntensity
    if (lightingManagerRef?.current && Object.keys(lightingUpdate).length > 0) {
      lightingManagerRef.current.updateLighting(lightingUpdate);
    }
  };

  /**
   * Reset lighting to default
   */
  const resetLighting = () => {
    if (lightingManagerRef?.current) {
      lightingManagerRef.current.resetToDefault();
      const newLighting = lightingManagerRef.current.getLighting();
      setLighting(newLighting);
    } else {
      setLighting(DEFAULT_LIGHTING);
    }
    setReflectionIntensity(DEFAULT_STATE.reflectionIntensity);
  };

  return {
    lighting, // The lighting object { exposure, ambient, key, fill, rim }
    setLighting: updateLighting,
    reflectionIntensity,
    setReflectionIntensity,
    metalFinish,
    setMetalFinish,
    showLightingControls,
    setShowLightingControls,
    showReflections,
    setShowReflections,
    resetLighting,
    // Expose lightingManagerRef for external access if needed
    lightingManagerRef,
  };
}
