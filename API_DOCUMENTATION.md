# ArtworkViewer API Documentation

Simple guide for using the ArtworkViewer component in API mode.

## Installation & Setup

### Step 1: Install Dependencies

```bash
npm install react react-dom three
```

**Required versions:**
- `react`: ^18.0.0
- `react-dom`: ^18.0.0
- `three`: ^0.160.0

### Step 2: Copy Required Files

Copy these folders and files to your React project:

```
your-project/
└── src/
    ├── viewer/                    # Copy entire folder
    │   ├── ArtworkViewer.jsx
    │   ├── useArtworkViewer.jsx
    │   └── index.jsx
    │
    ├── managers/                  # Copy entire folder
    │   ├── SceneManager.jsx
    │   ├── EnvironmentManager.jsx
    │   ├── ModelManager.jsx
    │   ├── TextureManager.jsx
    │   ├── MeshVisibilityManager.jsx
    │   ├── MaterialProcessor.jsx
    │   └── index.jsx
    │
    ├── materials/                 # Copy entire folder
    │   ├── index.js
    │   ├── BaseMaterial.jsx
    │   ├── AcrylicMaterial.jsx
    │   ├── MetalMaterial.jsx
    │   ├── MetalBoxMaterial.jsx
    │   ├── WoodMaterial.jsx
    │   ├── MirrorMaterial.jsx
    │   └── DefaultMaterial.jsx
    │
    ├── lighting/                  # Copy entire folder
    │   ├── LightingManager.jsx
    │   └── index.jsx
    │
    ├── hooks/                     # Copy entire folder
    │   ├── index.jsx
    │   ├── useMaterialType.jsx
    │   ├── useTextureLayers.jsx
    │   ├── useMeshVisibility.jsx
    │   ├── useLighting.jsx
    │   ├── useTextureOperations.jsx
    │   └── useMaterialUpdates.jsx
    │
    ├── utils/                     # Copy entire folder
    │   ├── index.jsx
    │   ├── meshUtils.jsx
    │   ├── textureUtils.jsx
    │   ├── textureTransformUtils.jsx
    │   └── usdzUtils.jsx
    │
    └── config/                     # Copy entire folder
        └── appConfig.jsx
```

### Step 3: Update Import Paths

**Important:** All import paths use relative paths (`../`). If you place the folders in a different location, you may need to update paths.

**Default structure (recommended):**
- All folders should be at the same level under `src/`
- Example: `src/viewer/`, `src/managers/`, `src/materials/`, etc.

**If you place files in a different location:**
- Update relative paths in files that import from other folders
- Example: If `viewer/` is in `src/components/viewer/`, update imports in `useArtworkViewer.jsx`

### Step 4: Add HDRI Files (Required)

The component automatically selects HDRI files based on material type. Add these files to your `public` folder:

```
your-project/
└── public/
    └── assets/
        └── hdr/
            ├── studio1.hdr        # Default HDRI for ACRYLIC, METAL, METAL_BOX, WOOD
            └── studio2.hdr         # Special HDRI for MIRROR materials
```

**HDRI paths are configured in `config/appConfig.jsx`:**

```jsx
export const MODEL_PATHS = {
  HDRI: "/assets/hdr/studio1.hdr",        // Default HDRI
  HDRI_MIRROR: "/assets/hdr/studio2.hdr", // Mirror-specific HDRI
  // ...
};
```

**Note:** HDRI files are automatically selected based on material type - no need to specify them in setup!

### Step 5: Verify File Structure

Your final structure should look like this:

```
your-project/
├── package.json
├── src/
│   ├── viewer/
│   ├── managers/
│   ├── materials/
│   ├── lighting/
│   ├── hooks/
│   ├── utils/
│   └── config/
└── public/
    └── assets/
        └── hdr/
            └── studio3.hdr
```

### Step 6: Import and Use

```jsx
import { ArtworkViewer } from './viewer';  // or './src/viewer' depending on your structure
import { ORIENTATION_TYPES, isOrientationAvailableForMaterial } from './config/appConfig';  // Optional: For orientation constants and helpers
```

## Quick Start

```jsx
import { ArtworkViewer } from './viewer';
import { useRef } from 'react';

function MyApp() {
  const viewerRef = useRef(null);

  const setupScene = async () => {
    await viewerRef.current?.setup({
      artworkTexture: '/path/to/artwork.jpg',
      orientation: 'portrait',  // 'portrait', 'landscape', 'surfboard', or 'skateboard'
      materialType: 'ACRYLIC'
    });
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ArtworkViewer
        ref={viewerRef}
        onReady={() => {
          console.log('Viewer ready!');
          setupScene();
        }}
      />
    </div>
  );
}
```

## Component Props

### Required
- None! The component works without any props.

### Optional Callbacks

| Prop | Type | Description |
|------|------|-------------|
| `onReady` | `function` | Called when viewer is ready: `(api) => {}` |
| `onError` | `function` | Called on error: `(error) => {}` |
| `onModeChange` | `function` | Called when mode changes: `(mode) => {}` |

## API Methods

All methods are accessed via the component ref:

```jsx
const viewerRef = useRef(null);
// Use: viewerRef.current?.methodName()
```

### 1. Setup Scene

**`setup(options)`** - Initialize everything with artwork, orientation, material type, and optional frame.
**Model path and HDRI are automatically selected based on orientation and material type!**

```jsx
await viewerRef.current?.setup({
  artworkTexture: textureUrl,  // REQUIRED: Path or blob URL to artwork image
  orientation: 'portrait',      // REQUIRED: 'portrait', 'landscape', 'surfboard', or 'skateboard'
  materialType: 'METAL',        // REQUIRED: 'ACRYLIC', 'METAL', 'METAL_BOX', 'WOOD', 'MIRROR'
  modelPath: modelFile,         // Optional: Custom model path (auto-selected if not provided)
  frameTexture: frameUrl,       // Optional: Path or blob URL to frame image
  mode: 'fullBleed',            // Optional: 'fullBleed' or 'shrunk' (default: 'fullBleed')
  hdriPath: customHdriPath,     // Optional: Custom HDRI path (auto-selected if not provided)
  size: { width: 600, height: 900 }  // Optional: Custom size (defaults: Portrait 450x675, Landscape 675x450, Surfboard 300x1200, Skateboard 200x800)
});
```

**Important Notes:**
- **Surfboard and Skateboard orientations are only available for ACRYLIC material type**
- If you try to use `surfboard` or `skateboard` with a non-ACRYLIC material, an error will be thrown
- These orientations use models from the root `/assets/models/` folder (not in Portrait/Landscape folders)

**Simple Example (Recommended):**
```jsx
const handleSetup = async () => {
  // That's it! Model path and HDRI are auto-selected based on orientation and material type
  await viewerRef.current?.setup({
    artworkTexture: artworkUrl,
    orientation: 'portrait',     // Select portrait, landscape, surfboard, or skateboard
    materialType: 'ACRYLIC'      // Model and HDRI automatically selected
  });
};
```

**Landscape Example:**
```jsx
const handleSetup = async () => {
  await viewerRef.current?.setup({
    artworkTexture: artworkUrl,
    orientation: 'landscape',    // Use landscape models
    materialType: 'METAL'
  });
};
```

**Surfboard Example (ACRYLIC only):**
```jsx
const handleSetup = async () => {
  await viewerRef.current?.setup({
    artworkTexture: artworkUrl,
    orientation: 'surfboard',     // Surfboard orientation (ACRYLIC only)
    materialType: 'ACRYLIC'      // Required: Surfboard only works with ACRYLIC
  });
};
```

**Skateboard Example (ACRYLIC only):**
```jsx
const handleSetup = async () => {
  await viewerRef.current?.setup({
    artworkTexture: artworkUrl,
    orientation: 'skateboard',    // Skateboard orientation (ACRYLIC only)
    materialType: 'ACRYLIC'      // Required: Skateboard only works with ACRYLIC
  });
};
```

**With Custom Model Path:**
```jsx
const handleSetup = async () => {
  await viewerRef.current?.setup({
    artworkTexture: artworkUrl,
    materialType: 'METAL',
    modelPath: customModelPath,  // Override auto-selection
    mode: 'fullBleed'
  });
};
```

**With Custom Size:**
```jsx
const handleSetup = async () => {
  await viewerRef.current?.setup({
    artworkTexture: artworkUrl,
    orientation: 'portrait',
    materialType: 'ACRYLIC',
    size: { width: 600, height: 900 }  // Custom size (default: 450x675 for portrait)
  });
};
```

### 2. Update Artwork

**`updateArtwork(texturePath)`** - Update artwork texture (applies to both fullBleed and shrunk modes).

```jsx
await viewerRef.current?.updateArtwork(textureUrl);
```

**Example:**
```jsx
const handleUpdateArtwork = async () => {
  await viewerRef.current?.updateArtwork('/new-artwork.jpg');
};
```

### 3. Update Frame

**`updateFrame(texturePath)`** - Update frame texture (for shrunk mode).

```jsx
await viewerRef.current?.updateFrame(frameUrl);
```

**Example:**
```jsx
const handleUpdateFrame = async () => {
  await viewerRef.current?.updateFrame('/new-frame.jpg');
};
```

### 4. Switch Mode

**`setMode(mode)`** - Switch between fullBleed and shrunk modes.

```jsx
viewerRef.current?.setMode('fullBleed');  // or 'shrunk'
```

**Example:**
```jsx
const handleSwitchMode = () => {
  const newMode = currentMode === 'fullBleed' ? 'shrunk' : 'fullBleed';
  viewerRef.current?.setMode(newMode);
};
```

### 5. Change Material Type

**`setMaterialType(type)`** - Change material type.

```jsx
viewerRef.current?.setMaterialType('METAL');
```

**Available types:**
- `'ACRYLIC'`
- `'METAL'`
- `'METAL_BOX'`
- `'WOOD'`
- `'MIRROR'`

**Example:**
```jsx
const handleMaterialChange = (type) => {
  viewerRef.current?.setMaterialType(type);
};
```

### 6. Update Texture by Identifier

**`updateTexture(identifier, texturePath)`** - Update texture on a specific layer by identifier.

```jsx
await viewerRef.current?.updateTexture(identifier, textureUrl);
```

**Parameters:**
- `identifier` (string) - Layer identifier. Can be:
  - Mesh name (e.g., `'Artwork_FullBleed'`, `'Artwork_Shrunk'`)
  - Mesh type: `'fullBleed'` or `'shrunk'`
  - Layer ID
- `texturePath` (string) - Path or URL to texture image

**Returns:** Promise that resolves when texture is updated, or rejects if layer not found.

**Example:**
```jsx
// Update texture on fullBleed layer
await viewerRef.current?.updateTexture('fullBleed', '/new-texture.jpg');

// Update texture on specific mesh
await viewerRef.current?.updateTexture('Artwork_Shrunk', '/new-texture.jpg');
```

### 7. Reset Texture

**`resetTexture(layerId)`** - Reset a specific texture layer to its original texture.

```jsx
viewerRef.current?.resetTexture(layerId);
```

**Parameters:**
- `layerId` (string) - Layer identifier (mesh name, mesh type, or layer ID)

**Returns:** `true` if reset successful, `false` otherwise.

**Example:**
```jsx
// Reset fullBleed layer to original texture
viewerRef.current?.resetTexture('fullBleed');

// Reset specific mesh
viewerRef.current?.resetTexture('Artwork_Shrunk');
```

### 8. Reset Artwork

**`resetArtwork(mode)`** - Reset artwork texture for a specific mode to its original.

```jsx
viewerRef.current?.resetArtwork(mode);
```

**Parameters:**
- `mode` (string, optional) - Mode to reset (`'fullBleed'` or `'shrunk'`). If not provided, uses current mode.

**Returns:** `true` if reset successful, `false` otherwise.

**Example:**
```jsx
// Reset artwork for current mode
viewerRef.current?.resetArtwork();

// Reset artwork for specific mode
viewerRef.current?.resetArtwork('fullBleed');
```

### 9. Reset All Textures

**`resetAllTextures()`** - Reset all texture layers to their original textures.

```jsx
viewerRef.current?.resetAllTextures();
```

**Example:**
```jsx
// Reset all textures to original state
viewerRef.current?.resetAllTextures();
```

### 10. Transform Texture

**`transformTexture(layerId, transform, selectionRect)`** - Apply transform (translate, scale, rotate) to a texture layer.

```jsx
await viewerRef.current?.transformTexture(layerId, transform, selectionRect);
```

**Parameters:**
- `layerId` (string) - Layer identifier (mesh name, mesh type, or layer ID)
- `transform` (Object) - Transform parameters:
  - `translateX` (number) - X translation in pixels
  - `translateY` (number) - Y translation in pixels
  - `scaleX` (number) - X scale factor
  - `scaleY` (number) - Y scale factor
  - `rotationDeg` (number) - Rotation in degrees
- `selectionRect` (Object, optional) - Selection rectangle for cropping:
  - `x` (number) - X position
  - `y` (number) - Y position
  - `width` (number) - Width
  - `height` (number) - Height

**Returns:** Promise that resolves when transform is applied.

**Example:**
```jsx
// Apply transform to fullBleed layer
await viewerRef.current?.transformTexture('fullBleed', {
  translateX: 50,
  translateY: -30,
  scaleX: 1.2,
  scaleY: 1.2,
  rotationDeg: 45
});

// Apply transform with crop selection
await viewerRef.current?.transformTexture('fullBleed', {
  translateX: 0,
  translateY: 0,
  scaleX: 1.0,
  scaleY: 1.0,
  rotationDeg: 0
}, {
  x: 100,
  y: 100,
  width: 500,
  height: 500
});
```

### 11. Apply Texture Transform to All Layers

**`applyTextureTransformToAllLayers(transform, selectionRect)`** - Apply the same transform to all texture layers.

```jsx
await viewerRef.current?.applyTextureTransformToAllLayers(transform, selectionRect);
```

**Parameters:**
- `transform` (Object) - Transform parameters (same as `transformTexture`)
- `selectionRect` (Object, optional) - Selection rectangle for cropping (same as `transformTexture`)

**Returns:** Promise that resolves when all transforms are applied.

**Example:**
```jsx
// Apply same transform to all layers
await viewerRef.current?.applyTextureTransformToAllLayers({
  translateX: 20,
  translateY: 20,
  scaleX: 1.1,
  scaleY: 1.1,
  rotationDeg: 5
});
```

### 12. Export Texture from Canvas

**`exportTextureFromCanvas(canvas, format, quality)`** - Export texture from a canvas element as a data URL.

```jsx
const dataUrl = viewerRef.current?.exportTextureFromCanvas(canvas, format, quality);
```

**Parameters:**
- `canvas` (HTMLCanvasElement) - Canvas element to export
- `format` (string, optional) - Image format. Default: `'image/png'`. Options: `'image/png'`, `'image/jpeg'`
- `quality` (number, optional) - Quality for JPEG (0-1). Default: `1`. Only used for JPEG format.

**Returns:** String - Data URL of the exported image.

**Example:**
```jsx
// Export as PNG
const canvas = document.createElement('canvas');
// ... draw to canvas ...
const pngDataUrl = viewerRef.current?.exportTextureFromCanvas(canvas);

// Export as JPEG with quality
const jpegDataUrl = viewerRef.current?.exportTextureFromCanvas(canvas, 'image/jpeg', 0.9);

// Use the data URL (e.g., download or display)
const link = document.createElement('a');
link.href = pngDataUrl;
link.download = 'texture.png';
link.click();
```

### 13. Set Size During Setup

**`setup(options)`** - The `setup` method accepts an optional `size` parameter to specify custom dimensions.

```jsx
await viewerRef.current?.setup({
  artworkTexture: textureUrl,
  orientation: 'portrait',  // or 'landscape'
  materialType: 'ACRYLIC',
  size: { width: 600, height: 900 }  // Optional: Custom size
});
```

**Parameters:**
- `size` (Object, optional) - Size object with `width` and `height` in pixels
  - Default sizes:
    - Portrait: `450x675`
    - Landscape: `675x450`
    - Surfboard: `300x1200`
    - Skateboard: `200x800`

**Example:**
```jsx
// Setup with custom size
await viewerRef.current?.setup({
  artworkTexture: '/artwork.jpg',
  orientation: 'portrait',
  materialType: 'METAL',
  size: { width: 600, height: 900 }
});

// Setup with default size (size not specified)
await viewerRef.current?.setup({
  artworkTexture: '/artwork.jpg',
  orientation: 'portrait',
  materialType: 'ACRYLIC'
  // Uses default: 450x675 for portrait
});

// Setup Surfboard with default size
await viewerRef.current?.setup({
  artworkTexture: '/artwork.jpg',
  orientation: 'surfboard',
  materialType: 'ACRYLIC'  // Required: Surfboard only works with ACRYLIC
  // Uses default: 300x1200 for surfboard
});

// Setup Skateboard with custom size
await viewerRef.current?.setup({
  artworkTexture: '/artwork.jpg',
  orientation: 'skateboard',
  materialType: 'ACRYLIC',  // Required: Skateboard only works with ACRYLIC
  size: { width: 250, height: 1000 }  // Custom size (default: 200x800)
});
```

### 14. Rescale Model

**`rescaleModel(sizeRatio)`** - Rescale the existing model based on size ratio without reloading. This preserves the model's rotation and position while only changing the scale.

```jsx
viewerRef.current?.rescaleModel(sizeRatio);
```

**Parameters:**
- `sizeRatio` (Object) - Size ratio object:
  - `widthRatio` (number) - Width ratio: `newWidth / defaultWidth`
  - `heightRatio` (number) - Height ratio: `newHeight / defaultHeight`

**Returns:** No return value. Model is rescaled in place.

**Example:**
```jsx
import { ORIENTATION_TYPES, DEFAULT_SIZES } from './config/appConfig';

// Calculate size ratio
const orientation = ORIENTATION_TYPES.PORTRAIT; // or LANDSCAPE, SURFBOARD, SKATEBOARD
const defaultSize = DEFAULT_SIZES[orientation] || DEFAULT_SIZES.PORTRAIT;

const newSize = { width: 600, height: 900 };
const sizeRatio = {
  widthRatio: newSize.width / defaultSize.width,   // 600/450 = 1.33
  heightRatio: newSize.height / defaultSize.height // 900/675 = 1.33
};

// Rescale the model in real-time
viewerRef.current?.rescaleModel(sizeRatio);
```

**Note:** This method is ideal for updating the model size after it's been loaded, as it doesn't require reloading the model and preserves all transformations.

## Complete Example

```jsx
import { ArtworkViewer } from './viewer';
import { useRef, useState } from 'react';

function MyApp() {
  const viewerRef = useRef(null);
  const [artworkUrl, setArtworkUrl] = useState(null);
  const [orientation, setOrientation] = useState('portrait'); // 'portrait', 'landscape', 'surfboard', or 'skateboard'
  const [materialType, setMaterialType] = useState('ACRYLIC');

  const handleSetup = async () => {
    try {
      // Simple setup - model path and HDRI are auto-selected!
      await viewerRef.current?.setup({
        artworkTexture: artworkUrl,
        orientation: orientation,  // 'portrait', 'landscape', 'surfboard', or 'skateboard'
        materialType: materialType // Model and HDRI automatically selected
        // Note: 'surfboard' and 'skateboard' only work with 'ACRYLIC' material type
      });
      console.log('Scene ready!');
    } catch (error) {
      console.error('Setup failed:', error);
    }
  };

  const handleUpdateArtwork = async () => {
    await viewerRef.current?.updateArtwork(artworkUrl);
  };

  const handleSwitchMode = () => {
    const current = viewerRef.current?.getMode();
    const newMode = current === 'fullBleed' ? 'shrunk' : 'fullBleed';
    viewerRef.current?.setMode(newMode);
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ArtworkViewer
        ref={viewerRef}
        onReady={() => console.log('Ready!')}
        onError={(error) => console.error('Error:', error)}
        onModeChange={(mode) => console.log('Mode:', mode)}
      />
      
      <button onClick={handleSetup}>Setup Scene</button>
      <button onClick={handleUpdateArtwork}>Update Artwork</button>
      <button onClick={handleSwitchMode}>Switch Mode</button>
    </div>
  );
}
```

## Notes

- **Orientation**: Must be specified as one of:
  - `'portrait'` - Standard portrait orientation
  - `'landscape'` - Standard landscape orientation
  - `'surfboard'` - Surfboard orientation (ACRYLIC only)
  - `'skateboard'` - Skateboard orientation (ACRYLIC only)
  
- **Model Organization**:
  - Portrait models: `/assets/models/Potraits/{MaterialType}/`
  - Landscape models: `/assets/models/Landscape/{MaterialType}/`
  - Surfboard models: `/assets/models/Surfboard_{size}.glb` (root folder, ACRYLIC only)
  - Skateboard models: `/assets/models/Skateboard_{size}.glb` (root folder, ACRYLIC only)

- **Orientation Restrictions**:
  - `'surfboard'` and `'skateboard'` orientations are **only available for ACRYLIC material type**
  - Attempting to use these orientations with other materials will throw an error
  - Use `isOrientationAvailableForMaterial(orientation, materialType)` helper to check availability

- **Default Sizes**:
  - Portrait: `450x675`
  - Landscape: `675x450`
  - Surfboard: `300x1200`
  - Skateboard: `200x800`

- **Model Path**: Auto-selected based on orientation and material type. Can be overridden with custom File object or string path
- **HDRI**: Automatically selected based on material type:
  - `MIRROR` → Uses `studio2.hdr`
  - All others (`ACRYLIC`, `METAL`, `METAL_BOX`, `WOOD`) → Uses `studio1.hdr`
- **Texture Paths**: Can be blob URLs (from `URL.createObjectURL()`) or file paths
- **Draco Compression**: Supported automatically - no extra setup needed
- **Setup is Simple**: Just provide `artworkTexture`, `orientation`, and `materialType` - everything else is automatic!

## Material Types

- **ACRYLIC**: Transparent acrylic material
- **METAL**: Metal material with reflections
- **METAL_BOX**: Metal box variant
- **WOOD**: Wood material
- **MIRROR**: Mirror material with reflections

## Modes

- **fullBleed**: Artwork extends to edges (no frame visible)
- **shrunk**: Artwork with frame visible around edges

---

## Troubleshooting

### Import Errors

If you get import errors:
1. **Check all folders are copied correctly** - All folders must be at the same level under `src/`
2. **Verify import paths** - All imports use relative paths (`../`). If you placed files differently, update paths
3. **Check file extensions** - Ensure `.jsx` files have correct extensions

### HDRI Not Loading

If HDRI doesn't load:
1. **Check files exist** - Verify both `public/assets/hdr/studio1.hdr` and `studio2.hdr` exist
2. **Update paths in config** - Edit `config/appConfig.jsx` and update `MODEL_PATHS.HDRI` and `MODEL_PATHS.HDRI_MIRROR` if using different locations
3. **Check browser console** - Look for 404 errors or loading failures
4. **Verify material type** - HDRI is auto-selected based on material type (MIRROR uses studio2.hdr, others use studio1.hdr)

### Model Not Loading

If models don't load:
1. **Model path is auto-selected** - Based on orientation and material type, so no need to specify unless using custom model
2. **Verify orientation** - Must be 'portrait', 'landscape', 'surfboard', or 'skateboard' (case-sensitive)
3. **Check folder structure** - Ensure models exist in:
   - Portrait: `/public/assets/models/Potraits/{MaterialType}/`
   - Landscape: `/public/assets/models/Landscape/{MaterialType}/`
   - Surfboard: `/public/assets/models/Surfboard_{size}.glb` (root folder)
   - Skateboard: `/public/assets/models/Skateboard_{size}.glb` (root folder)
4. **Check orientation restrictions** - Surfboard and Skateboard only work with ACRYLIC material type
5. **Check browser console** - Look for error messages
6. **Validate GLB file** - Ensure model file is a valid GLB format
7. **Verify material type** - Ensure material type is one of: 'ACRYLIC', 'METAL', 'METAL_BOX', 'WOOD', 'MIRROR'
8. **Check model paths in config** - Verify `getModelPath()` in `config/appConfig.jsx` returns valid paths for your orientation and material types

### Path Issues

**If you placed files in a different location:**

All files use relative imports like `../managers/`, `../materials/`, etc. 

**Option 1: Keep default structure (recommended)**
```
src/
├── viewer/
├── managers/
├── materials/
├── lighting/
├── hooks/
├── utils/
└── config/
```

**Option 2: Update import paths**
If you place files elsewhere, update all relative imports:
- In `viewer/useArtworkViewer.jsx`: Update `../managers/`, `../materials/`, etc.
- In `managers/*.jsx`: Update `../materials/`, `../config/`, etc.
- In `materials/*.jsx`: Update `../config/`, etc.

**Example:** If you put everything in `src/components/artwork-viewer/`:
```jsx
// Change from:
import { createSceneManager } from "../managers/index.jsx";
// To:
import { createSceneManager } from "./managers/index.jsx";
```

### Common Issues

1. **"Cannot find module" errors** → Check folder structure and import paths
2. **HDRI not found** → Add HDRI file to `public/assets/hdr/` or update path in config
3. **Component not rendering** → Ensure container has width/height (e.g., `width: '100vw', height: '100vh'`)

---

## Exported Constants and Helpers

The `config/appConfig.jsx` file exports several useful constants and helper functions:

### Orientation Constants

```jsx
import { ORIENTATION_TYPES } from './config/appConfig';

// Available values:
ORIENTATION_TYPES.PORTRAIT    // 'portrait'
ORIENTATION_TYPES.LANDSCAPE   // 'landscape'
ORIENTATION_TYPES.SURFBOARD   // 'surfboard' (ACRYLIC only)
ORIENTATION_TYPES.SKATEBOARD  // 'skateboard' (ACRYLIC only)
```

### Default Sizes

```jsx
import { DEFAULT_SIZES } from './config/appConfig';

// Available default sizes:
DEFAULT_SIZES.PORTRAIT    // { width: 450, height: 675 }
DEFAULT_SIZES.LANDSCAPE   // { width: 675, height: 450 }
DEFAULT_SIZES.SURFBOARD   // { width: 300, height: 1200 }
DEFAULT_SIZES.SKATEBOARD  // { width: 200, height: 800 }
```

### Helper Functions

**`isOrientationAvailableForMaterial(orientation, materialType)`** - Check if an orientation is available for a given material type.

```jsx
import { isOrientationAvailableForMaterial, ORIENTATION_TYPES } from './config/appConfig';

// Check if surfboard is available for ACRYLIC
const isAvailable = isOrientationAvailableForMaterial(ORIENTATION_TYPES.SURFBOARD, 'ACRYLIC');
// Returns: true

// Check if surfboard is available for METAL
const isAvailable = isOrientationAvailableForMaterial(ORIENTATION_TYPES.SURFBOARD, 'METAL');
// Returns: false (surfboard only works with ACRYLIC)
```

**Available Orientations:**
- `ORIENTATION_TYPES.PORTRAIT` - 'portrait'
- `ORIENTATION_TYPES.LANDSCAPE` - 'landscape'
- `ORIENTATION_TYPES.SURFBOARD` - 'surfboard' (ACRYLIC only)
- `ORIENTATION_TYPES.SKATEBOARD` - 'skateboard' (ACRYLIC only)

**Example Usage:**
```jsx
import { isOrientationAvailableForMaterial, ORIENTATION_TYPES } from './config/appConfig';

function MyComponent() {
  const [orientation, setOrientation] = useState(ORIENTATION_TYPES.PORTRAIT);
  const [materialType, setMaterialType] = useState('ACRYLIC');
  
  const handleOrientationChange = (newOrientation) => {
    if (isOrientationAvailableForMaterial(newOrientation, materialType)) {
      setOrientation(newOrientation);
    } else {
      console.warn(`${newOrientation} is not available for ${materialType}`);
    }
  };
  
  // Enable/disable orientation buttons based on material
  const canUseSurfboard = isOrientationAvailableForMaterial(ORIENTATION_TYPES.SURFBOARD, materialType);
  const canUseSkateboard = isOrientationAvailableForMaterial(ORIENTATION_TYPES.SKATEBOARD, materialType);
  
  return (
    <div>
      <button 
        onClick={() => handleOrientationChange(ORIENTATION_TYPES.SURFBOARD)}
        disabled={!canUseSurfboard}
      >
        Surfboard {!canUseSurfboard && '(ACRYLIC only)'}
      </button>
    </div>
  );
}
```

---

**Getting Started:** The first 5 methods (`setup`, `updateArtwork`, `updateFrame`, `setMode`, `setMaterialType`) are all you need for basic usage. Additional methods (6-12) provide advanced texture management and transformation capabilities.
