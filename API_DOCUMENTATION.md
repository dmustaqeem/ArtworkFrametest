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
      orientation: 'portrait',  // or 'landscape'
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
  orientation: 'portrait',      // REQUIRED: 'portrait' or 'landscape'
  materialType: 'METAL',        // REQUIRED: 'ACRYLIC', 'METAL', 'METAL_BOX', 'WOOD', 'MIRROR'
  modelPath: modelFile,         // Optional: Custom model path (auto-selected if not provided)
  frameTexture: frameUrl,       // Optional: Path or blob URL to frame image
  mode: 'fullBleed',            // Optional: 'fullBleed' or 'shrunk' (default: 'fullBleed')
  hdriPath: customHdriPath      // Optional: Custom HDRI path (auto-selected if not provided)
});
```

**Simple Example (Recommended):**
```jsx
const handleSetup = async () => {
  // That's it! Model path and HDRI are auto-selected based on orientation and material type
  await viewerRef.current?.setup({
    artworkTexture: artworkUrl,
    orientation: 'portrait',     // Select portrait or landscape
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

## Complete Example

```jsx
import { ArtworkViewer } from './viewer';
import { useRef, useState } from 'react';

function MyApp() {
  const viewerRef = useRef(null);
  const [artworkUrl, setArtworkUrl] = useState(null);
  const [orientation, setOrientation] = useState('portrait'); // 'portrait' or 'landscape'
  const [materialType, setMaterialType] = useState('ACRYLIC');

  const handleSetup = async () => {
    try {
      // Simple setup - model path and HDRI are auto-selected!
      await viewerRef.current?.setup({
        artworkTexture: artworkUrl,
        orientation: orientation,  // 'portrait' or 'landscape'
        materialType: materialType // Model and HDRI automatically selected
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

- **Orientation**: Must be specified as 'portrait' or 'landscape'. Models are organized in separate folders:
  - Portrait models: `/assets/models/Potraits/{MaterialType}/`
  - Landscape models: `/assets/models/Landscape/{MaterialType}/`
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
2. **Verify orientation** - Must be 'portrait' or 'landscape' (case-sensitive)
3. **Check folder structure** - Ensure models exist in:
   - Portrait: `/public/assets/models/Potraits/{MaterialType}/`
   - Landscape: `/public/assets/models/Landscape/{MaterialType}/`
4. **Check browser console** - Look for error messages
5. **Validate GLB file** - Ensure model file is a valid GLB format
6. **Verify material type** - Ensure material type is one of: 'ACRYLIC', 'METAL', 'METAL_BOX', 'WOOD', 'MIRROR'
7. **Check model paths in config** - Verify `getModelPath()` in `config/appConfig.jsx` returns valid paths for your orientation and material types

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

**That's it!** These 5 methods are all you need to get started.
