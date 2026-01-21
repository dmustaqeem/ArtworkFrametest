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
      
      // Helper function to ensure texture is ready for export
      const ensureTextureReady = (texture) => {
        if (!texture || !texture.image) return Promise.resolve();
        
        return new Promise((resolve) => {
          if (texture.image instanceof HTMLImageElement) {
            if (texture.image.complete) {
              texture.needsUpdate = true;
              resolve();
            } else {
              texture.image.onload = () => {
                texture.needsUpdate = true;
                resolve();
              };
              texture.image.onerror = () => resolve(); // Continue even if image fails
            }
          } else if (texture.image instanceof HTMLCanvasElement) {
            texture.needsUpdate = true;
            resolve();
          } else {
            resolve();
          }
        });
      };
      
      // Wait for all textures to be ready before export
      const texturePromises = [];
      clonedObject.traverse((child) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat) => {
            if (mat) {
              const textureMaps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'];
              textureMaps.forEach((mapName) => {
                if (mat[mapName]) {
                  texturePromises.push(ensureTextureReady(mat[mapName]));
                }
              });
            }
          });
        }
      });
      
      // Wait for all textures to load
      await Promise.all(texturePromises);
      console.log("All textures ready for export");

      // Fix double-sided materials (USDZ doesn't support them)
      // Traverse the cloned object and set all materials to FrontSide
      // Also ensure textures are properly referenced and converted to images
      clonedObject.traverse((child) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          const newMaterials = [];
          
          materials.forEach((mat) => {
            if (mat) {
              // Always clone the material to ensure textures are properly referenced
              let clonedMat = mat.clone();
              
              // Fix double-sided materials
              if (clonedMat.side === THREE.DoubleSide) {
                clonedMat.side = THREE.FrontSide;
              }
              
              // USDZ compatibility: Convert transmission-based materials to opacity-based
              // USDZ doesn't fully support transmission, so we convert to opacity for export
              if (clonedMat.isMeshPhysicalMaterial && clonedMat.transmission > 0) {
                console.log("Converting transmission material to opacity for USDZ compatibility");
                
                // For USDZ, we need to convert MeshPhysicalMaterial to MeshStandardMaterial
                // because USDZ doesn't support transmission properties well
                const standardMat = new THREE.MeshStandardMaterial();
                
                // Copy basic properties
                standardMat.color = clonedMat.color?.clone() || new THREE.Color(0xffffff);
                standardMat.roughness = clonedMat.roughness ?? 0.5;
                standardMat.metalness = clonedMat.metalness ?? 0.0;
                standardMat.transparent = true;
                
                // Convert transmission to opacity
                if (clonedMat.transmission >= 1.0) {
                  standardMat.opacity = 0.2; // More visible to ensure texture shows through
                } else {
                  standardMat.opacity = Math.max(0.2, 1.0 - clonedMat.transmission);
                }
                
                // Copy textures
                if (clonedMat.map) standardMat.map = clonedMat.map;
                if (clonedMat.normalMap) standardMat.normalMap = clonedMat.normalMap;
                if (clonedMat.roughnessMap) standardMat.roughnessMap = clonedMat.roughnessMap;
                if (clonedMat.metalnessMap) standardMat.metalnessMap = clonedMat.metalnessMap;
                if (clonedMat.aoMap) standardMat.aoMap = clonedMat.aoMap;
                if (clonedMat.emissiveMap) standardMat.emissiveMap = clonedMat.emissiveMap;
                
                // Copy other properties
                standardMat.side = clonedMat.side === THREE.DoubleSide ? THREE.FrontSide : clonedMat.side;
                standardMat.needsUpdate = true;
                
                // Replace the material
                clonedMat = standardMat;
              }
              
              // Ensure all textures are properly set and updated
              // Convert textures to images for USDZ embedding
              const textureMaps = [
                'map', 'normalMap', 'roughnessMap', 'metalnessMap', 
                'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap',
                'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap'
              ];
              
              textureMaps.forEach((mapName) => {
                if (clonedMat[mapName]) {
                  const texture = clonedMat[mapName];
                  
                  // Ensure texture is updated
                  texture.needsUpdate = true;
                  
                  // If texture has an image, ensure it's loaded
                  if (texture.image) {
                    // Force texture update to ensure image is ready
                    if (texture.image instanceof HTMLImageElement && texture.image.complete) {
                      // Image is loaded, ensure texture is updated
                      texture.needsUpdate = true;
                    } else if (texture.image instanceof HTMLCanvasElement) {
                      // Canvas is ready
                      texture.needsUpdate = true;
                    }
                  }
                  
                  // Ensure texture has proper settings for USDZ
                  texture.flipY = false; // USDZ expects non-flipped textures
                }
              });
              
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
      // USDZExporter automatically embeds textures, but we need to ensure they're properly configured
      const exportOptions = {
        // Note: USDZExporter.parseAsync typically only takes the object, not options
        // Options might be passed differently or not at all
        ...options,
      };

      // Log texture information for debugging
      console.log("Starting USDZ export...");
      console.log("Exporting object:", clonedObject);
      console.log("Export options:", exportOptions);
      
      // Debug: Check textures in cloned object
      let textureCount = 0;
      clonedObject.traverse((child) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat) => {
            if (mat) {
              const textureMaps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
              textureMaps.forEach((mapName) => {
                if (mat[mapName]) {
                  textureCount++;
                  console.log(`Found texture: ${mapName} on material ${mat.name || 'unnamed'}, image:`, mat[mapName].image);
                }
              });
            }
          });
        }
      });
      console.log(`Total textures found: ${textureCount}`);
      
      let arrayBuffer;
      
      // First, check if parseAsync exists (async/await style) - this is the preferred method
      if (typeof exporter.parseAsync === 'function') {
        console.log("Using parseAsync method");
        try {
          // USDZExporter.parseAsync typically only takes the object, not options
          // Some versions might accept options as second parameter, but try object-only first
          arrayBuffer = await exporter.parseAsync(clonedObject);
          console.log("parseAsync returned, arrayBuffer length:", arrayBuffer?.byteLength);
          
          // If that didn't work or returned undefined, try with options
          if (!arrayBuffer && exportOptions) {
            console.log("Trying parseAsync with options...");
            arrayBuffer = await exporter.parseAsync(clonedObject, exportOptions);
          }
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
        throw new Error("Export returned empty result - USDZ file is empty or invalid");
      }
      
      // Validate that we have a reasonable file size (USDZ files should be at least a few KB)
      if (arrayBuffer.byteLength < 1024) {
        console.warn("USDZ file is very small (", arrayBuffer.byteLength, "bytes) - might be invalid");
      }
      
      // Validate that the file starts with ZIP signature (USDZ is a ZIP file)
      const view = new Uint8Array(arrayBuffer);
      const zipSignature = view[0] === 0x50 && view[1] === 0x4B; // "PK" - ZIP file signature
      if (!zipSignature && arrayBuffer.byteLength > 0) {
        console.error("File does not appear to be a valid ZIP file (missing PK signature)");
        console.error("First bytes:", Array.from(view.slice(0, 10)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
        throw new Error("USDZ export failed: File is not a valid ZIP format");
      }
      
      console.log("Export successful, arrayBuffer length:", arrayBuffer.byteLength);
      console.log("File appears to be valid ZIP format:", zipSignature);

      // Convert ArrayBuffer to Blob
      // Use the correct MIME type for USDZ files
      const blob = new Blob([arrayBuffer], { type: "model/vnd.usdz+zip" });
      
      // Validate blob
      if (blob.size === 0) {
        throw new Error("Blob creation failed - file is empty");
      }
      
      console.log("Blob created successfully, size:", blob.size, "bytes");

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
