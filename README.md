# 3D Model Texture Editor & Viewer - React Three.js Application

[![React](https://img.shields.io/badge/React-18.2-blue.svg)](https://reactjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-0.160-green.svg)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-purple.svg)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A powerful, interactive **3D model viewer and texture editor** built with React and Three.js. This application enables real-time texture manipulation, advanced lighting controls, and USDZ export for AR/VR applications. Perfect for artists, designers, and developers working with GLB/GLTF 3D models.

## 🎯 Features

### Core Functionality
- **📦 GLB/GLTF Model Loading** - Load and display 3D models in standard formats
- **🎨 Texture Layer Management** - Apply and manage multiple texture layers per mesh
- **🖼️ Visual Texture Transform Tool** - Interactive crop, scale, and rotate textures with a visual editor
- **💡 Advanced Lighting Controls** - Full control over ambient, directional, spot, and point lights
- **👁️ Mesh Visibility Toggle** - Show/hide individual meshes in complex models
- **🌐 Environment Mapping** - Realistic reflections with environment map support
- **📱 USDZ Export** - Export models to USDZ format for AR/VR applications (iOS, macOS)

### User Experience
- **🖱️ Interactive 3D Controls** - OrbitControls for intuitive camera manipulation
- **⚡ Real-time Preview** - See texture changes instantly
- **📊 Material Information** - Display model statistics (meshes, materials, material types)
- **🎛️ Collapsible UI Panels** - Clean, organized interface with expandable sections
- **🔄 Texture Reset** - Restore original textures with one click

## 🚀 Quick Start

### Prerequisites
- **Node.js** 16+ and npm (or yarn/pnpm)
- Modern web browser with WebGL support

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ArtworkFrametest
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Add your 3D models**
   - Place GLB/GLTF files in `public/assets/models/`
   - Add test textures in `public/assets/frames/`

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   - Navigate to `http://localhost:5173`

## 📖 Usage Guide

### Loading Models
1. Update `GLB_PATH` in `src/GlbTextureSwapTester.jsx` to point to your model
2. The model will load automatically on page load

### Applying Textures
1. Open the **Texture Layers** panel
2. Select a texture layer from the list
3. Click **Test 1** or **Test 2** to apply test textures
4. Click **Reset** to restore original texture

### Transforming Textures
1. Click **Transform Texture (All Layers)** button
2. In the modal:
   - **Pan**: Click and drag the image
   - **Scale**: Drag corner handles for uniform scaling, edge handles for single-axis scaling
   - **Rotate**: Use the rotation handle above the selection box
3. Click **Confirm & Apply** to apply changes to all texture layers

### Lighting Controls
1. Expand **Lighting Controls** panel
2. Adjust sliders for:
   - **Exposure**: Overall scene brightness
   - **Ambient**: Base illumination
   - **Key/Fill/Rim**: Three-point lighting setup
   - **Spot/Directional**: Additional lights for reflections
3. Click **Reset Lighting** to restore defaults

### Exporting to USDZ
1. Ensure your model is loaded and configured
2. Click **Export to USDZ** button
3. The file will download automatically

## 🏗️ Project Structure

```
ArtworkFrametest/
├── public/
│   └── assets/
│       ├── models/          # GLB/GLTF 3D models
│       └── frames/          # Texture images
├── src/
│   ├── App.jsx              # Main app component
│   ├── GlbTextureSwapTester.jsx    # Main 3D viewer component
│   ├── TextureLayerManager.jsx     # Texture layer management
│   ├── TextureTransformModal.jsx   # Visual texture transform tool
│   ├── USDZExporter.jsx            # USDZ export functionality
│   ├── main.jsx             # React entry point
│   ├── App.css              # App styles
│   └── index.css            # Global styles
├── package.json
├── vite.config.js
└── README.md
```

## 🧩 Component Documentation

### `GlbTextureSwapTester`
Main component that handles:
- 3D scene initialization
- Model loading and rendering
- Lighting setup and controls
- Mesh visibility management
- Integration of all sub-components

### `TextureLayerManager`
Manages texture layers:
- Detects all texture layers in the model
- Provides UI for applying test textures
- Handles texture reset functionality
- Supports multiple texture map types (map, normalMap, roughnessMap, etc.)

### `TextureTransformModal`
Visual texture transformation tool:
- Interactive canvas-based editor
- Fixed selection box with draggable handles
- Real-time preview of transformations
- Exports high-resolution textures (2048px)

### `USDZExporter`
USDZ export functionality:
- Converts Three.js models to USDZ format
- Handles material compatibility (fixes double-sided materials)
- Optimizes textures for AR/VR
- Triggers automatic download

## 🛠️ Technical Stack

- **React 18.2** - UI framework
- **Three.js 0.160** - 3D graphics library
- **Vite 5.0** - Build tool and dev server
- **OrbitControls** - Camera interaction
- **GLTFLoader** - GLB/GLTF model loading
- **USDZExporter** - AR/VR format export

## ⚙️ Configuration

### Model Path
Edit `GLB_PATH` in `src/GlbTextureSwapTester.jsx`:
```javascript
const GLB_PATH = "/assets/models/YourModel.glb";
```

### Test Textures
Update test texture paths:
```javascript
const TEST_IMAGE_1_PATH = "/assets/frames/image1.jpg";
const TEST_IMAGE_2_PATH = "/assets/frames/image2.jpeg";
```

### Lighting Defaults
Modify initial lighting values in the `lighting` state:
```javascript
const [lighting, setLighting] = useState({
  exposure: 1.0,
  ambient: 0.4,
  key: 1.2,
  // ... more lighting options
});
```

## 🏭 Build for Production

```bash
# Build optimized production bundle
npm run build

# Preview production build locally
npm run preview
```

Built files will be in the `dist/` directory.

## 🎨 Supported Formats

### 3D Models
- ✅ GLB (binary GLTF)
- ✅ GLTF (JSON-based)

### Textures
- ✅ JPEG/JPG
- ✅ PNG
- ✅ WebP (browser support)

### Export Formats
- ✅ USDZ (AR/VR)

## 🔧 Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Opera (latest)

**Note**: Requires WebGL 2.0 support for optimal performance.

## 📝 Key Features Explained

### Texture Transform Tool
The texture transform modal uses a **fixed selection box** approach:
- The dashed selection box represents the UV area applied to the model
- The image moves/scales/rotates **behind** the fixed box
- Only content inside the dashed box is exported and applied
- Supports high-resolution exports (2048px) for crisp textures

### Lighting System
Comprehensive lighting controls include:
- **Exposure**: Tone mapping control
- **Ambient**: Base scene illumination
- **Three-point lighting**: Key, fill, and rim lights
- **Spot lights**: Positionable with target controls
- **Directional lights**: For reflections and highlights
- **Environment mapping**: Realistic reflections on PBR materials

### Material Support
- **MeshStandardMaterial**: PBR materials with realistic lighting
- **MeshPhysicalMaterial**: Advanced PBR with clearcoat and transmission
- **MeshBasicMaterial**: Unlit materials (for frames/overlays)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## 🔗 Related Resources

- [Three.js Documentation](https://threejs.org/docs/)
- [React Documentation](https://react.dev/)
- [GLTF Specification](https://www.khronos.org/gltf/)
- [USDZ Format](https://developer.apple.com/augmented-reality/quick-look/)

## 📧 Support

For issues, questions, or contributions, please open an issue on the repository.

---

**Built with ❤️ using React, Three.js, and modern web technologies**
