# ArtworkViewer API Documentation

Simple guide for using the ArtworkViewer component in API mode.

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

**That's it!** These 5 methods are all you need to get started.
