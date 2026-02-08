import React, { useRef, forwardRef, useEffect } from "react";
import { useArtworkViewer } from "./useArtworkViewer.jsx";
import { MODEL_PATHS } from "../config/appConfig.jsx";

/**
 * ArtworkViewer - Plug-and-play Three.js component
 * 
 * A clean, UI-free component for rendering 3D artwork frames.
 * Controlled entirely via props and ref methods.
 * 
 * @example
 * ```jsx
 * import { ArtworkViewer } from './viewer';
 * 
 * function MyApp() {
 *   const viewerRef = useRef(null);
 *   
 *   return (
 *     <ArtworkViewer
 *       ref={viewerRef}
 *       modelPath="/models/frame.glb"
 *       materialType="METAL"
 *       mode="fullBleed"
 *       onReady={(api) => {
 *         // Component ready, use API methods
 *         viewerRef.current?.updateArtwork('/artwork.jpg');
 *       }}
 *     />
 *   );
 * }
 * ```
 */
const ArtworkViewer = forwardRef((props, ref) => {
  const {
    // Model & Assets
    modelPath,
    hdriPath = MODEL_PATHS.HDRI, // Default to HDRI from config
    
    // Material Configuration
    materialType = "ACRYLIC",
    metalFinish,
    metalColor,
    
    // Mode Configuration
    mode = "fullBleed",
    initialMode,
    
    // Lighting Configuration
    lighting,
    defaultLighting,
    
    // Scene Configuration
    sceneConfig,
    cameraPosition,
    cameraTarget,
    
    // Texture Configuration
    filterBackTextures = true, // Filter out "back" texture layers by default
    textureLayerFilter, // Custom filter function
    
    // Callbacks
    onReady,
    onError,
    onModeChange,
    onTextureUpdate,
    onLoadingProgress,
    
    // Styling
    className,
    style,
    showLoadingIndicator = true,
    showErrorIndicator = true,
    
    // Advanced
    autoRotate = false,
    enableControls = true,
    
    ...restProps
  } = props;

  const mountRef = useRef(null);
  const apiRef = useRef(null);

  const { loading, error } = useArtworkViewer({
    mountRef,
    modelPath,
    hdriPath,
    materialType,
    metalFinish,
    metalColor,
    mode: initialMode || mode,
    lighting: defaultLighting || lighting,
    sceneConfig: {
      ...sceneConfig,
      cameraPosition: cameraPosition || sceneConfig?.cameraPosition,
      cameraTarget: cameraTarget || sceneConfig?.cameraTarget,
    },
    filterBackTextures,
    textureLayerFilter,
    onReady,
    onError,
    onModeChange,
    onTextureUpdate,
    onLoadingProgress,
    apiRef,
  });

  // Expose API via ref - use useEffect to ensure apiRef is set
  useEffect(() => {
    if (ref) {
      if (typeof ref === "function") {
        ref(apiRef.current);
      } else {
        ref.current = apiRef.current;
      }
    }
  });

  return (
    <div
      ref={mountRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        zIndex: 1,
        ...style,
      }}
      {...restProps}
    >
      {showLoadingIndicator && loading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#666",
            fontSize: "14px",
            zIndex: 1000,
          }}
        >
          Loading...
        </div>
      )}
      {showErrorIndicator && error && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#ff6b6b",
            fontSize: "14px",
            padding: "10px",
            background: "rgba(255, 255, 255, 0.9)",
            borderRadius: "4px",
            zIndex: 1000,
            maxWidth: "80%",
            textAlign: "center",
          }}
        >
          Error: {error}
        </div>
      )}
    </div>
  );
});

ArtworkViewer.displayName = "ArtworkViewer";

export { ArtworkViewer };
