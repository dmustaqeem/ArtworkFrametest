import { useState } from "react";
import * as THREE from "three";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";

/**
 * USDZExporter Component
 * 
 * Exports the current 3D model state to USDZ format and triggers download.
 * 
 * @param {Object} props
 * @param {THREE.Object3D} props.model - The 3D model to export
 * @param {THREE.Scene} props.scene - The Three.js scene (optional, used if model not provided)
 * @param {string} props.filename - Optional filename for the download (default: "model.usdz")
 * @param {Object} props.options - Optional export options
 */
export default function USDZExporterButton({ model, scene, filename = "model.usdz", options = {} }) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  const handleExport = async () => {
    if (!model && !scene) {
      setError("No model or scene provided for export");
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      // Create exporter instance
      const exporter = new USDZExporter();

      // Determine what to export
      // If model is provided, export just the model (with all its children and materials)
      // Otherwise, export the entire scene
      const objectToExport = model || scene;

      // Clone the object to avoid modifying the original
      // This also allows us to fix material compatibility issues
      // Use clone(true) to deep clone including children
      const clonedObject = objectToExport.clone(true);
      
      // Fix double-sided materials (USDZ doesn't support them)
      // Traverse the cloned object and set all materials to FrontSide
      // Also ensure textures are properly referenced
      clonedObject.traverse((child) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          const newMaterials = [];
          
          materials.forEach((mat) => {
            if (mat) {
              // Always clone the material to ensure textures are properly referenced
              const clonedMat = mat.clone();
              
              // Fix double-sided materials
              if (clonedMat.side === THREE.DoubleSide) {
                clonedMat.side = THREE.FrontSide;
              }
              
              // Ensure textures are properly set
              if (clonedMat.map) {
                clonedMat.map.needsUpdate = true;
              }
              
              newMaterials.push(clonedMat);
            }
          });
          
          // Replace materials
          if (Array.isArray(child.material)) {
            child.material = newMaterials;
          } else {
            child.material = newMaterials[0] || child.material;
          }
        }
      });

      // Default export options
      const exportOptions = {
        maxTextureSize: 2048, // Limit texture size for USDZ compatibility
        ...options,
      };

      // Try different approaches to get the export result
      console.log("Starting USDZ export...");
      console.log("Exporting object:", clonedObject);
      console.log("Export options:", exportOptions);
      
      let arrayBuffer;
      
      // First, check if parseAsync exists (async/await style) - this is the preferred method
      if (typeof exporter.parseAsync === 'function') {
        console.log("Using parseAsync method");
        try {
          arrayBuffer = await exporter.parseAsync(clonedObject, exportOptions);
          console.log("parseAsync returned, arrayBuffer length:", arrayBuffer?.byteLength);
        } catch (asyncErr) {
          console.error("parseAsync error:", asyncErr);
          throw asyncErr;
        }
      } 
      // Fall back to parse method (which only takes 1 parameter based on function signature)
      else if (typeof exporter.parse === 'function') {
        console.log("Using parse method");
        console.log("exporter.parse function signature:", exporter.parse.length, "parameters");
        
        // Since parse only has 1 parameter, it likely returns a value directly or a Promise
        try {
          console.log("Calling exporter.parse with object only...");
          const result = exporter.parse(clonedObject);
          
          console.log("Parse result type:", typeof result, "is Promise:", result instanceof Promise, "is ArrayBuffer:", result instanceof ArrayBuffer);
          
          // Check if it returns a Promise
          if (result instanceof Promise) {
            console.log("Parse returned a Promise, awaiting...");
            arrayBuffer = await result;
          }
          // Check if it returns ArrayBuffer directly
          else if (result instanceof ArrayBuffer || result instanceof Uint8Array) {
            console.log("Parse returned ArrayBuffer directly:", result.byteLength);
            arrayBuffer = result;
          }
          // Check if it returns a string (data URL or path)
          else if (typeof result === 'string') {
            console.log("Parse returned string, might be data URL");
            // If it's a data URL, convert to ArrayBuffer
            if (result.startsWith('data:')) {
              const response = await fetch(result);
              arrayBuffer = await response.arrayBuffer();
            } else {
              throw new Error("Unexpected string result from parse");
            }
          }
          else {
            console.error("Unexpected result type from parse:", result);
            throw new Error(`Parse returned unexpected type: ${typeof result}`);
          }
        } catch (err) {
          console.error("Error calling parse:", err);
          throw err;
        }
      } else {
        throw new Error("USDZExporter does not have parse or parseAsync method");
      }
      
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error("Export returned empty result");
      }
      
      console.log("Export successful, arrayBuffer length:", arrayBuffer.byteLength);

      // Convert ArrayBuffer to Blob
      const blob = new Blob([arrayBuffer], { type: "model/vnd.usdz+zip" });

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename.endsWith(".usdz") ? filename : `${filename}.usdz`;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log("USDZ export successful:", filename);
    } catch (err) {
      console.error("USDZ export failed:", err);
      setError(`Export failed: ${err.message || "Unknown error"}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        onClick={handleExport}
        disabled={isExporting || (!model && !scene)}
        style={{
          width: "100%",
          padding: 14,
          border: 0,
          borderRadius: 6,
          background: isExporting ? "#666" : "#FF6B35",
          color: "white",
          cursor: isExporting || (!model && !scene) ? "not-allowed" : "pointer",
          fontSize: 14,
          fontWeight: 700,
          opacity: isExporting || (!model && !scene) ? 0.6 : 1,
          transition: "background-color 0.2s",
          boxShadow: !isExporting && (model || scene) ? "0 0 10px rgba(255, 107, 53, 0.3)" : "none",
        }}
        onMouseEnter={(e) => {
          if (!isExporting && (model || scene)) {
            e.target.style.background = "#E55A2B";
          }
        }}
        onMouseLeave={(e) => {
          if (!isExporting && (model || scene)) {
            e.target.style.background = "#FF6B35";
          }
        }}
      >
        {isExporting ? "Exporting..." : "Export to USDZ"}
      </button>
      {error && (
        <div
          style={{
            padding: 8,
            background: "#ff4444",
            color: "white",
            borderRadius: 4,
            fontSize: 11,
            fontFamily: "monospace",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
