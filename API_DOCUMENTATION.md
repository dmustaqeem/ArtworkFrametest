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

### Step 4: Add HDRI File (Optional but Recommended)

The component uses a default HDRI file. Add it to your `public` folder:

```
your-project/
└── public/
    └── assets/
        └── hdr/
            └── studio3.hdr        # Download or use your own HDRI file
```

**Update HDRI path in `config/appConfig.jsx`:**

```jsx
export const MODEL_PATHS = {
  GLB: "/assets/models/Acrylic/Acrylic_450x675.glb",  // Not used in API mode
  HDRI: "/assets/hdr/studio3.hdr",  // Update this path if needed
  // ...
};
```

**Note:** If you don't provide an HDRI file, the component will still work but without environment reflections.

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

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ArtworkViewer
        ref={viewerRef}
        onReady={() => {
          console.log('Viewer ready!');
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

**`setup(options)`** - Initialize everything with model, textures, and material type.

```jsx
await viewerRef.current?.setup({
  modelPath: modelFile,        // File object or path to GLB
  artworkTexture: textureUrl,  // Path or blob URL to artwork image
  materialType: 'METAL',        // 'ACRYLIC', 'METAL', 'METAL_BOX', 'WOOD', 'MIRROR'
  frameTexture: frameUrl,      // Optional: Path or blob URL to frame image
  mode: 'fullBleed'            // Optional: 'fullBleed' or 'shrunk' (default: 'fullBleed')
});
```

**Example:**
```jsx
const handleSetup = async () => {
  await viewerRef.current?.setup({
    modelPath: modelFile,
    artworkTexture: artworkUrl,
    materialType: 'METAL',
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
  const [modelFile, setModelFile] = useState(null);
  const [artworkUrl, setArtworkUrl] = useState(null);

  const handleSetup = async () => {
    try {
      await viewerRef.current?.setup({
        modelPath: modelFile,
        artworkTexture: artworkUrl,
        materialType: 'METAL',
        mode: 'fullBleed'
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

- **Model Path**: Can be a File object (from file input) or a string path
- **Texture Paths**: Can be blob URLs (from `URL.createObjectURL()`) or file paths
- **HDRI**: Loads automatically from config (`/assets/hdr/studio3.hdr`) - no need to specify
- **Draco Compression**: Supported automatically - no extra setup needed

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
1. **Check file exists** - Verify `public/assets/hdr/studio3.hdr` exists
2. **Update path in config** - Edit `config/appConfig.jsx` and update `MODEL_PATHS.HDRI` if using different location
3. **Check browser console** - Look for 404 errors or loading failures

### Model Not Loading

If models don't load:
1. **Verify File object** - Ensure you're passing a valid File object or path string
2. **Check browser console** - Look for error messages
3. **Validate GLB file** - Ensure model file is a valid GLB format

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
