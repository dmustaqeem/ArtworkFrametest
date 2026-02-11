/**
 * MeshVisibilityManager - Manages mesh visibility, classification, and relationships
 */
export class MeshVisibilityManager {
  constructor() {
    this.meshes = [];
    this.meshTypeMap = {
      fullBleed: ['artwork_fullbleed', 'artwork_full_bleed'],
      silverFullBleed: ['silver_fullbleed', 'silver_full_bleed'],
      whiteMetalFullBleed: ['whitemetal_fullbleed', 'whitemetal_full_bleed', 'white_metal_fullbleed', 'white_metal_full_bleed'],
      woodFullBleed: ['wood_fullbleed', 'wood_full_bleed'],
      mirrorFullBleed: ['mirror_fullbleed', 'mirror_full_bleed'],
      acrylicFullBleed: ['acrylic_fullbleed', 'acrylic_full_bleed'],
      shrunk: ['artwork_shrunk', 'artwork_shrink'],
      silverShrunk: ['silver_shrunk', 'silver_shrink'],
      whiteMetalShrunk: ['whitemetal_shrunk', 'whitemetal_shrink', 'white_metal_shrunk', 'white_metal_shrink'],
      woodShrunk: ['wood_shrunk', 'wood_shrink'],
      mirrorShrunk: ['mirror_shrunk', 'mirror_shrink'],
      acrylicShrunk: ['acrylic_shrunk', 'acrylic_shrink'],
      frame: ['frame_edge', 'frame'],
      back: ['back', 'rear'],
      silverMetalBack: ['metal_box_silver_back', 'metal_silver_back'],
      whiteMetalBack: ['metal_box_white_back', 'metal_white_back'],
      woodBack: ['wood_back'],
      mirrorBack: ['mirror_back'],
      acrylicBack: ['acrylic_back'],
      glass: ['glass', 'cover', 'plexi', 'acrylic_cover'],
    };
  }

  /**
   * Classify mesh type based on name
   * Handles naming conventions:
   * - Metal Canvas Brushed Silver: Artwork_FullBleed, Artwork_Shrunk, Frame_Edge, Metal_Box_Silver_Back, Silver_FullBleed, Silver_Shrunk
   * - Metal Canvas White: Artwork_FullBleed, Artwork_Shrunk, Frame_Edge, Metal_Box_White_Back, WhiteMetal_FullBleed, WhiteMetal_Shrunk
   * - Wood: Artwork_FullBleed, Artwork_Shrunk, Frame_Edge, Wood_Back, Wood_FullBleed, Wood_Shrunk
   * - Mirror: Artwork_FullBleed, Artwork_Shrunk, Frame_Edge, Mirror_Back, Mirror_FullBleed, Mirror_Shrunk
   * - Acrylic: Artwork_FullBleed, Artwork_Shrunk, Frame_Edge, Acrylic_Back, Glass, Acrylic_FullBleed, Acrylic_Shrunk
   */
  classifyMeshType(meshName) {
    if (!meshName) return "other";
    
    const nameLower = meshName.toLowerCase();
    
    // Check for glass first (most specific - must be checked before other acrylic meshes)
    if (nameLower.includes('glass') || nameLower.includes('cover') || nameLower.includes('plexi') || 
        nameLower.includes('acrylic_cover') || (nameLower.includes('acrylic') && nameLower.includes('cover'))) {
      return "glass";
    }
    
    // Check for acrylic back (most specific - must be checked before generic back)
    if (nameLower.includes('acrylic') && (nameLower.includes('back') || nameLower.includes('rear'))) {
      return "acrylicBack";
    }
    
    // Check for mirror back first (most specific - must be checked before generic back)
    if (nameLower.includes('mirror') && (nameLower.includes('back') || nameLower.includes('rear'))) {
      return "mirrorBack";
    }
    
    // Check for wood back (most specific - must be checked before generic back)
    if (nameLower.includes('wood') && (nameLower.includes('back') || nameLower.includes('rear'))) {
      return "woodBack";
    }
    
    // Check for white metal back (most specific - must be checked before generic back)
    if (nameLower.includes('metal_box_white_back') || nameLower.includes('metal_white_back')) {
      return "whiteMetalBack";
    }
    
    // Check for silver metal back (most specific - must be checked before generic back)
    if (nameLower.includes('metal_box_silver_back') || nameLower.includes('metal_silver_back')) {
      return "silverMetalBack";
    }
    
    // Check for acrylic full bleed (Acrylic_FullBleed) - must be checked before artwork full bleed
    if (nameLower.includes('acrylic') && (nameLower.includes('fullbleed') || nameLower.includes('full_bleed'))) {
      return "acrylicFullBleed";
    }
    
    // Check for mirror full bleed (Mirror_FullBleed) - must be checked before artwork full bleed
    if (nameLower.includes('mirror') && (nameLower.includes('fullbleed') || nameLower.includes('full_bleed'))) {
      return "mirrorFullBleed";
    }
    
    // Check for wood full bleed (Wood_FullBleed) - must be checked before artwork full bleed
    if (nameLower.includes('wood') && (nameLower.includes('fullbleed') || nameLower.includes('full_bleed'))) {
      return "woodFullBleed";
    }
    
    // Check for acrylic shrunk (Acrylic_Shrunk) - must be checked before artwork shrunk
    if (nameLower.includes('acrylic') && (nameLower.includes('shrunk') || nameLower.includes('shrink'))) {
      return "acrylicShrunk";
    }
    
    // Check for mirror shrunk (Mirror_Shrunk) - must be checked before artwork shrunk
    if (nameLower.includes('mirror') && (nameLower.includes('shrunk') || nameLower.includes('shrink'))) {
      return "mirrorShrunk";
    }
    
    // Check for wood shrunk (Wood_Shrunk) - must be checked before artwork shrunk
    if (nameLower.includes('wood') && (nameLower.includes('shrunk') || nameLower.includes('shrink'))) {
      return "woodShrunk";
    }
    
    // Check for white metal full bleed (WhiteMetal_FullBleed)
    if ((nameLower.includes('whitemetal') || (nameLower.includes('white') && nameLower.includes('metal'))) && 
        (nameLower.includes('fullbleed') || nameLower.includes('full_bleed'))) {
      return "whiteMetalFullBleed";
    }
    
    // Check for silver full bleed (Silver_FullBleed)
    if (nameLower.includes('silver') && (nameLower.includes('fullbleed') || nameLower.includes('full_bleed'))) {
      return "silverFullBleed";
    }
    
    // Check for artwork full bleed (Artwork_FullBleed)
    if (nameLower.includes('artwork') && (nameLower.includes('fullbleed') || nameLower.includes('full_bleed'))) {
      return "fullBleed";
    }
    
    // Check for white metal shrunk (WhiteMetal_Shrunk)
    if ((nameLower.includes('whitemetal') || (nameLower.includes('white') && nameLower.includes('metal'))) && 
        (nameLower.includes('shrunk') || nameLower.includes('shrink'))) {
      return "whiteMetalShrunk";
    }
    
    // Check for silver shrunk (Silver_Shrunk)
    if (nameLower.includes('silver') && (nameLower.includes('shrunk') || nameLower.includes('shrink'))) {
      return "silverShrunk";
    }
    
    // Check for artwork shrunk (Artwork_Shrunk)
    if (nameLower.includes('artwork') && (nameLower.includes('shrunk') || nameLower.includes('shrink'))) {
      return "shrunk";
    }
    
    // Check for frame edge (Frame_Edge)
    if (nameLower.includes('frame') && nameLower.includes('edge')) {
      return "frame";
    }
    
    // Check for back meshes (generic)
    if (nameLower.includes('back') || nameLower.includes('rear')) {
      return "back";
    }
    
    // Fallback to keyword matching
    for (const [type, keywords] of Object.entries(this.meshTypeMap)) {
      if (keywords.some(keyword => nameLower.includes(keyword))) {
        return type;
      }
    }
    
    return "other";
  }

  /**
   * Collect all meshes from a Three.js object
   */
  collectMeshes(object, options = {}) {
    const meshes = [];
    let meshIdCounter = 0;

    object.traverse((obj) => {
      if (!obj.isMesh) return;

      const meshId = options.idPrefix 
        ? `${options.idPrefix}_${meshIdCounter++}`
        : `mesh_${meshIdCounter++}`;
      
      const meshName = obj.name || `Mesh_${meshIdCounter}`;
      const meshType = this.classifyMeshType(meshName);

      // Ensure *back* meshes are always visible by default.
      // Glass is NOT treated as a back mesh so it can be controlled independently.
      const isBackMesh =
        meshType === "back" ||
        meshType === "woodBack" ||
        meshType === "mirrorBack" ||
        meshType === "whiteMetalBack" ||
        meshType === "silverMetalBack" ||
        meshType === "acrylicBack";

      if (isBackMesh && obj) {
        obj.visible = true;
      }

      const meshInfo = {
        id: meshId,
        name: meshName,
        visible: isBackMesh ? true : obj.visible,
        mesh: obj,
        hasMaterial: !!obj.material,
        meshType: meshType,
      };

      meshes.push(meshInfo);
    });

    this.meshes = meshes;
    return meshes;
  }

  /**
   * Apply visibility relationships
   * 
   * Rules:
   * - If Artwork_FullBleed is ON → only Wood_FullBleed (for wood), Mirror_FullBleed (for mirror), Acrylic_FullBleed (for acrylic), or Metal_White_FullBleed (for white metals) should be ON
   * - If Artwork_Shrunk is ON → Frame_Edge, Wood_Shrunk/Mirror_Shrunk/Acrylic_Shrunk/Metal_White_Shrunk, and Artwork_Shrunk should be ON
   * - Wood_Back, Mirror_Back, Acrylic_Back, and Metal_White_Back always ON
   * - For silver metal materials: If fullBleed is ON → shrunk and frame must be OFF
   * - For silver metal materials: If shrunk is ON → frame is ON and fullBleed is OFF
   * - Back meshes (Metal_Box_Silver_Back, Metal_Box_White_Back, Wood_Back, Mirror_Back, Acrylic_Back) always ON
   * - Glass meshes always ON
   */
  applyVisibilityRelationships() {
    // Find artwork meshes
    const artworkFullBleed = this.meshes.find(m => m.meshType === "fullBleed");
    const artworkShrunk = this.meshes.find(m => m.meshType === "shrunk");
    
    // Find wood meshes
    const woodFullBleed = this.meshes.find(m => m.meshType === "woodFullBleed");
    const woodShrunk = this.meshes.find(m => m.meshType === "woodShrunk");
    const woodBack = this.meshes.find(m => m.meshType === "woodBack");
    
    // Find mirror meshes
    const mirrorFullBleed = this.meshes.find(m => m.meshType === "mirrorFullBleed");
    const mirrorShrunk = this.meshes.find(m => m.meshType === "mirrorShrunk");
    const mirrorBack = this.meshes.find(m => m.meshType === "mirrorBack");
    
    // Find acrylic meshes
    const acrylicFullBleed = this.meshes.find(m => m.meshType === "acrylicFullBleed");
    const acrylicShrunk = this.meshes.find(m => m.meshType === "acrylicShrunk");
    const acrylicBack = this.meshes.find(m => m.meshType === "acrylicBack");
    
    // Find white metal meshes
    const whiteMetalFullBleed = this.meshes.find(m => m.meshType === "whiteMetalFullBleed");
    const whiteMetalShrunk = this.meshes.find(m => m.meshType === "whiteMetalShrunk");
    const whiteMetalBack = this.meshes.find(m => m.meshType === "whiteMetalBack");
    
    // Find frame
    const frameEdge = this.meshes.find(m => m.meshType === "frame");
    
    // Find silver metal full bleed variants
    const silverFullBleed = this.meshes.find(m => m.meshType === "silverFullBleed");
    
    // Find silver metal shrunk variants
    const silverShrunk = this.meshes.find(m => m.meshType === "silverShrunk");
    
    // Ensure back meshes are always visible
    this.meshes.forEach(m => {
      if (
        (m.meshType === "back" ||
         m.meshType === "woodBack" ||
         m.meshType === "mirrorBack" ||
         m.meshType === "whiteMetalBack" ||
         m.meshType === "acrylicBack") &&
        m.mesh
      ) {
        m.mesh.visible = true;
        m.visible = true;
      }
    });
    
    // Check if Artwork_FullBleed is visible (wood, mirror, acrylic, white metal, or silver metal mode)
    if (artworkFullBleed && artworkFullBleed.visible) {
      // Artwork_FullBleed ON → only Wood_FullBleed, Mirror_FullBleed, Acrylic_FullBleed, Metal_White_FullBleed, or Metal_Silver_FullBleed should be ON
      this.meshes.forEach(m => {
        if (m.mesh) {
          // Defensive: Preserve acrylic base layer visibility when parent visibility changes
          if (m.mesh.children) {
            m.mesh.children.forEach(child => {
              if (child.userData?.isAcrylicEmissiveBase) {
                child.visible = m.mesh.visible; // Keep base layer in sync with parent
              }
            });
          }
          
          if (m.meshType === "woodFullBleed" || m.meshType === "mirrorFullBleed" || 
              m.meshType === "acrylicFullBleed" || m.meshType === "whiteMetalFullBleed" || 
              m.meshType === "silverFullBleed") {
            m.mesh.visible = true;
            m.visible = true;
          } else if (m.meshType === "woodShrunk" || m.meshType === "mirrorShrunk" || 
                     m.meshType === "acrylicShrunk" || m.meshType === "whiteMetalShrunk" || 
                     m.meshType === "silverShrunk" || m.meshType === "frame" || m.meshType === "shrunk") {
            m.mesh.visible = false;
            m.visible = false;
          }
        }
      });
    } else if (artworkShrunk && artworkShrunk.visible) {
      // Artwork_Shrunk ON → Frame_Edge, Wood_Shrunk/Mirror_Shrunk/Acrylic_Shrunk/Metal_White_Shrunk/Metal_Silver_Shrunk, and Artwork_Shrunk should be ON
      this.meshes.forEach(m => {
        if (m.mesh) {
          // Defensive: Preserve acrylic base layer visibility when parent visibility changes
          if (m.mesh.children) {
            m.mesh.children.forEach(child => {
              if (child.userData?.isAcrylicEmissiveBase) {
                child.visible = m.mesh.visible; // Keep base layer in sync with parent
              }
            });
          }
          
          if (m.meshType === "frame" || m.meshType === "woodShrunk" || 
              m.meshType === "mirrorShrunk" || m.meshType === "acrylicShrunk" || 
              m.meshType === "whiteMetalShrunk" || m.meshType === "silverShrunk" || 
              m.meshType === "shrunk") {
            m.mesh.visible = true;
            m.visible = true;
          } else if (m.meshType === "woodFullBleed" || m.meshType === "mirrorFullBleed" || 
                     m.meshType === "acrylicFullBleed" || m.meshType === "whiteMetalFullBleed" || 
                     m.meshType === "silverFullBleed" || m.meshType === "fullBleed") {
            m.mesh.visible = false;
            m.visible = false;
          }
        }
      });
      } else {
      // Legacy metal material logic (for backward compatibility)
      // This handles cases where silver/white metal meshes are toggled directly
      const isFullBleedMode = (silverFullBleed && silverFullBleed.visible) ||
                              (whiteMetalFullBleed && whiteMetalFullBleed.visible) ||
                              (acrylicFullBleed && acrylicFullBleed.visible);
      
      const isShrunkMode = (silverShrunk && silverShrunk.visible) ||
                           (whiteMetalShrunk && whiteMetalShrunk.visible) ||
                           (acrylicShrunk && acrylicShrunk.visible);
      
      if (isFullBleedMode) {
        // Full bleed mode: Show all full bleed variants, hide all shrunk and frame
        this.meshes.forEach(m => {
          if (m.mesh) {
            // Defensive: Preserve acrylic base layer visibility when parent visibility changes
            if (m.mesh.children) {
              m.mesh.children.forEach(child => {
                if (child.userData?.isAcrylicEmissiveBase) {
                  child.visible = m.mesh.visible; // Keep base layer in sync with parent
                }
              });
            }
            
            if (m.meshType === "fullBleed" || m.meshType === "silverFullBleed" || 
                m.meshType === "whiteMetalFullBleed" || m.meshType === "acrylicFullBleed") {
              m.mesh.visible = true;
              m.visible = true;
            } else if (m.meshType === "frame" || m.meshType === "shrunk" || 
                       m.meshType === "silverShrunk" || m.meshType === "whiteMetalShrunk" ||
                       m.meshType === "acrylicShrunk") {
              m.mesh.visible = false;
              m.visible = false;
            }
          }
        });
      } else if (isShrunkMode) {
        // Shrunk mode: Show frame and all shrunk variants, hide all full bleed variants
        this.meshes.forEach(m => {
          if (m.mesh) {
            // Defensive: Preserve acrylic base layer visibility when parent visibility changes
            if (m.mesh.children) {
              m.mesh.children.forEach(child => {
                if (child.userData?.isAcrylicEmissiveBase) {
                  child.visible = m.mesh.visible; // Keep base layer in sync with parent
                }
              });
            }
            if (m.meshType === "frame" || m.meshType === "shrunk" || 
                m.meshType === "silverShrunk" || m.meshType === "whiteMetalShrunk" ||
                m.meshType === "acrylicShrunk") {
              m.mesh.visible = true;
              m.visible = true;
            } else if (m.meshType === "fullBleed" || m.meshType === "silverFullBleed" || 
                       m.meshType === "whiteMetalFullBleed" || m.meshType === "acrylicFullBleed") {
              m.mesh.visible = false;
              m.visible = false;
            }
          }
        });
      }
    }
  }

  /**
   * Toggle mesh visibility and apply relationships
   * 
   * Rules:
   * - If Artwork_FullBleed is ON → only Wood_FullBleed (for wood), Mirror_FullBleed (for mirror), or Metal_White_FullBleed (for white metals) should be ON
   * - If Artwork_Shrunk is ON → Frame_Edge, Wood_Shrunk/Mirror_Shrunk/Metal_White_Shrunk, and Artwork_Shrunk should be ON
   * - Wood_Back, Mirror_Back, and Metal_White_Back always ON (cannot be toggled)
   * - For silver metal materials: When Artwork_FullBleed is ON: Silver_FullBleed ON, Frame_Edge OFF, Artwork_Shrunk OFF, Silver_Shrunk OFF
   * - For silver metal materials: When Artwork_Shrunk is ON: Frame_Edge ON, Artwork_Shrunk ON, Silver_Shrunk ON, Artwork_FullBleed OFF, Silver_FullBleed OFF
   * - Back meshes always ON
   */
  toggleMeshVisibility(meshId) {
    const mesh = this.meshes.find(m => m.id === meshId);
    if (!mesh) return;

    // Never allow toggling back meshes off (Glass can be toggled independently)
    if (
      mesh.meshType === "back" ||
      mesh.meshType === "woodBack" ||
      mesh.meshType === "mirrorBack" ||
      mesh.meshType === "acrylicBack" ||
      mesh.meshType === "whiteMetalBack" ||
      mesh.meshType === "silverMetalBack"
    ) {
      if (mesh.mesh) {
        mesh.mesh.visible = true;
      }
      mesh.visible = true;
      return this.meshes;
    }

    // Toggle visibility
    const newVisible = !mesh.visible;
    if (mesh.mesh) {
      mesh.mesh.visible = newVisible;
    }
    mesh.visible = newVisible;

    // Apply relationships based on mesh type
    // Check if this is Artwork_FullBleed (wood, mirror, acrylic, white metal, or silver metal mode)
    if (mesh.meshType === "fullBleed") {
      if (newVisible) {
        // Artwork_FullBleed ON → only Wood_FullBleed, Mirror_FullBleed, Acrylic_FullBleed, Metal_White_FullBleed, or Metal_Silver_FullBleed should be ON
        this.meshes.forEach(m => {
          if (m.mesh) {
            if (m.meshType === "woodFullBleed" || m.meshType === "mirrorFullBleed" || 
                m.meshType === "acrylicFullBleed" || m.meshType === "whiteMetalFullBleed" || 
                m.meshType === "silverFullBleed") {
              m.mesh.visible = true;
              m.visible = true;
            } else if (m.meshType === "woodShrunk" || m.meshType === "mirrorShrunk" || 
                       m.meshType === "acrylicShrunk" || m.meshType === "whiteMetalShrunk" || 
                       m.meshType === "silverShrunk" || m.meshType === "frame" || m.meshType === "shrunk") {
              m.mesh.visible = false;
              m.visible = false;
            }
          }
        });
      } else {
        // Artwork_FullBleed OFF - turn OFF Wood_FullBleed, Mirror_FullBleed, Acrylic_FullBleed, Metal_White_FullBleed, and Metal_Silver_FullBleed
        this.meshes.forEach(m => {
          if ((m.meshType === "woodFullBleed" || m.meshType === "mirrorFullBleed" || 
               m.meshType === "acrylicFullBleed" || m.meshType === "whiteMetalFullBleed" || 
               m.meshType === "silverFullBleed") && m.mesh) {
            m.mesh.visible = false;
            m.visible = false;
          }
        });
      }
    } else if (mesh.meshType === "shrunk") {
      // Artwork_Shrunk toggled
      if (newVisible) {
        // Artwork_Shrunk ON → Frame_Edge, Wood_Shrunk/Mirror_Shrunk/Acrylic_Shrunk/Metal_White_Shrunk/Metal_Silver_Shrunk, and Artwork_Shrunk should be ON
        this.meshes.forEach(m => {
          if (m.mesh) {
            if (m.meshType === "frame" || m.meshType === "woodShrunk" || 
                m.meshType === "mirrorShrunk" || m.meshType === "acrylicShrunk" || 
                m.meshType === "whiteMetalShrunk" || m.meshType === "silverShrunk" || 
                m.meshType === "shrunk") {
              m.mesh.visible = true;
              m.visible = true;
            } else if (m.meshType === "woodFullBleed" || m.meshType === "mirrorFullBleed" || 
                       m.meshType === "acrylicFullBleed" || m.meshType === "whiteMetalFullBleed" || 
                       m.meshType === "silverFullBleed" || m.meshType === "fullBleed") {
              m.mesh.visible = false;
              m.visible = false;
            }
          }
        });
      } else {
        // Artwork_Shrunk OFF - turn OFF Frame_Edge, Wood_Shrunk, Mirror_Shrunk, Acrylic_Shrunk, Metal_White_Shrunk, Metal_Silver_Shrunk
        this.meshes.forEach(m => {
          if (m.mesh && (m.meshType === "frame" || m.meshType === "woodShrunk" || 
                         m.meshType === "mirrorShrunk" || m.meshType === "acrylicShrunk" || 
                         m.meshType === "whiteMetalShrunk" || m.meshType === "silverShrunk")) {
            m.mesh.visible = false;
            m.visible = false;
          }
        });
      }
    } else {
      // Metal material logic (existing behavior)
      const isFullBleedType = mesh.meshType === "silverFullBleed" || 
                              mesh.meshType === "whiteMetalFullBleed";
      
      const isShrunkType = mesh.meshType === "silverShrunk" || 
                           mesh.meshType === "whiteMetalShrunk";
      
      if (isFullBleedType) {
        // Any metal full bleed variant toggled
        if (newVisible) {
          // Turn ON: All full bleed variants
          // Turn OFF: Frame_Edge, all shrunk variants
          this.meshes.forEach(m => {
            if (m.mesh) {
              if (m.meshType === "fullBleed" || m.meshType === "silverFullBleed" || m.meshType === "whiteMetalFullBleed") {
                m.mesh.visible = true;
                m.visible = true;
              } else if (m.meshType === "frame" || m.meshType === "shrunk" || 
                         m.meshType === "silverShrunk" || m.meshType === "whiteMetalShrunk") {
                m.mesh.visible = false;
                m.visible = false;
              }
            }
          });
        } else {
          // Full bleed is OFF - turn OFF all full bleed variants
          this.meshes.forEach(m => {
            if ((m.meshType === "fullBleed" || m.meshType === "silverFullBleed" || m.meshType === "whiteMetalFullBleed") && m.mesh) {
              m.mesh.visible = false;
              m.visible = false;
            }
          });
        }
      } else if (isShrunkType) {
        // Any metal shrunk variant toggled
        if (newVisible) {
          // Turn ON: Frame_Edge, all shrunk variants
          // Turn OFF: All full bleed variants
          this.meshes.forEach(m => {
            if (m.mesh) {
              if (m.meshType === "frame" || m.meshType === "shrunk" || 
                  m.meshType === "silverShrunk" || m.meshType === "whiteMetalShrunk") {
                m.mesh.visible = true;
                m.visible = true;
              } else if (m.meshType === "fullBleed" || m.meshType === "silverFullBleed" || 
                         m.meshType === "whiteMetalFullBleed") {
                m.mesh.visible = false;
                m.visible = false;
              }
            }
          });
        } else {
          // Shrunk is OFF - turn OFF Frame_Edge and all shrunk variants
          this.meshes.forEach(m => {
            if (m.mesh && (m.meshType === "frame" || m.meshType === "shrunk" || 
                           m.meshType === "silverShrunk" || m.meshType === "whiteMetalShrunk")) {
              m.mesh.visible = false;
              m.visible = false;
            }
          });
        }
      } else if (mesh.meshType === "frame") {
        // Frame_Edge toggled - sync with shrunk mode
        const artworkShrunk = this.meshes.find(m => m.meshType === "shrunk");
        if (artworkShrunk && artworkShrunk.mesh) {
          artworkShrunk.mesh.visible = newVisible;
          artworkShrunk.visible = newVisible;
          // Apply shrunk logic
          this.toggleMeshVisibility(artworkShrunk.id);
          return this.meshes;
        }
      }
    }

    // Ensure back meshes are always visible (Glass remains independent)
    this.meshes.forEach(m => {
      if (
        (m.meshType === "back" ||
         m.meshType === "woodBack" ||
         m.meshType === "mirrorBack" ||
         m.meshType === "acrylicBack" ||
         m.meshType === "whiteMetalBack" ||
         m.meshType === "silverMetalBack") &&
        m.mesh
      ) {
        m.mesh.visible = true;
        m.visible = true;
      }
    });

    return this.meshes;
  }

  /**
   * Filter texture layers based on mesh visibility
   * Only show texture options for meshes that are currently visible/on
   * @param {Array} textureLayers - Array of texture layers to filter
   * @param {string} materialType - Optional material type (METAL, METAL_BOX, etc.)
   */
  filterTextureLayersByMeshVisibility(textureLayers, materialType = null) {
    // For metals, mirrors, and acrylics, show all texture layers without filtering
    if (materialType === "METAL" || materialType === "METAL_BOX" || materialType === "ACRYLIC" || materialType === "MIRROR") {
      return textureLayers;
    }
    
    // Filter texture layers: only show layers for meshes that are currently visible
    return textureLayers.filter(layer => {
      const layerMesh = this.meshes.find(m => m.mesh === layer.mesh);
      
      // If mesh not found in our mesh list, don't show it
      if (!layerMesh) {
        return false;
      }
      
      // Hide Wood_Back, Mirror_Back, Acrylic_Back, Glass, WhiteMetal_Back, SilverMetal_Back and other back meshes from texture layers (always on, no need as texture layer option)
      if (layerMesh.meshType === "woodBack" || layerMesh.meshType === "mirrorBack" || 
          layerMesh.meshType === "acrylicBack" || layerMesh.meshType === "glass" ||
          layerMesh.meshType === "whiteMetalBack" || layerMesh.meshType === "silverMetalBack" || layerMesh.meshType === "back") {
        return false;
      }
      
      // Only show texture layers for meshes that are currently visible
      return layerMesh.visible;
    });
  }

  /**
   * Get all meshes
   */
  getMeshes() {
    return this.meshes;
  }

  /**
   * Get mesh by ID
   */
  getMeshById(meshId) {
    return this.meshes.find(m => m.id === meshId);
  }

  /**
   * Get meshes by type
   */
  getMeshesByType(meshType) {
    return this.meshes.filter(m => m.meshType === meshType);
  }

  /**
   * Set meshes directly
   */
  setMeshes(meshes) {
    this.meshes = meshes;
  }

  /**
   * Clear meshes
   */
  clear() {
    this.meshes = [];
  }
}

/**
 * Factory function to create MeshVisibilityManager
 */
export function createMeshVisibilityManager() {
  return new MeshVisibilityManager();
}
