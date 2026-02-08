import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/**
 * SceneManager - Manages Three.js scene, camera, renderer, and controls
 */
export class SceneManager {
  constructor(mountElement, options = {}) {
    this.mountElement = mountElement;
    this.options = {
      fov: options.fov || 60,
      near: options.near || 0.1,
      far: options.far || 1000,
      initialCameraPosition: options.initialCameraPosition || new THREE.Vector3(0, 0.6, 3.5),
      enableShadows: options.enableShadows || false,
      physicallyCorrectLights: options.physicallyCorrectLights !== false, // Default true
      toneMapping: options.toneMapping || THREE.ACESFilmicToneMapping,
      outputColorSpace: options.outputColorSpace || THREE.SRGBColorSpace,
      ...options
    };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.rafId = null;
    this.isAnimating = false;
    this.resizeHandler = null;

    this.initialize();
  }

  initialize() {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = null; // Transparent for CSS gradient background

    // Get size from mount element if available, otherwise use window
    const initialWidth = this.mountElement?.clientWidth || window.innerWidth;
    const initialHeight = this.mountElement?.clientHeight || window.innerHeight;
    const aspect = initialWidth / initialHeight;

    // Camera - use correct aspect ratio from mount element
    this.camera = new THREE.PerspectiveCamera(
      this.options.fov,
      aspect,
      this.options.near,
      this.options.far
    );
    this.camera.position.copy(this.options.initialCameraPosition);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true 
    });
    this.renderer.setSize(initialWidth, initialHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = this.options.outputColorSpace;
    this.renderer.toneMapping = this.options.toneMapping;
    this.renderer.setClearColor(0x000000, 0); // Transparent
    this.renderer.shadowMap.enabled = this.options.enableShadows;
    this.renderer.physicallyCorrectLights = this.options.physicallyCorrectLights;

    // Append to mount element
    if (this.mountElement) {
      // Style the canvas to be contained within its parent
      this.renderer.domElement.style.position = 'absolute';
      this.renderer.domElement.style.top = '0';
      this.renderer.domElement.style.left = '0';
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      this.renderer.domElement.style.display = 'block';
      this.renderer.domElement.style.zIndex = '1';
      this.mountElement.appendChild(this.renderer.domElement);
    }

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enableRotate = true;
    this.controls.enablePan = true;
    this.controls.enableZoom = true;
    this.controls.target.set(0, 0, 0);

    // Setup resize handler
    this.resizeHandler = () => this.handleResize();
    window.addEventListener("resize", this.resizeHandler);
  }

  handleResize() {
    if (!this.camera || !this.renderer || !this.mountElement) return;
    
    // Get the actual size of the mount element instead of window
    const width = this.mountElement.clientWidth || window.innerWidth;
    const height = this.mountElement.clientHeight || window.innerHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  setToneMappingExposure(exposure) {
    if (this.renderer) {
      this.renderer.toneMappingExposure = exposure;
    }
  }

  startAnimation() {
    if (this.isAnimating) return;
    
    this.isAnimating = true;
    const animate = () => {
      if (!this.isAnimating) return;
      
      this.rafId = requestAnimationFrame(animate);
      if (this.controls) this.controls.update();
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    animate();
  }

  stopAnimation() {
    this.isAnimating = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  updateControlsTarget(target) {
    if (this.controls && target) {
      this.controls.target.copy(target);
      this.controls.update();
    }
  }

  resetCamera(position, target) {
    if (this.camera && position) {
      this.camera.position.copy(position);
    }
    if (target) {
      this.camera.lookAt(target);
    }
    if (this.controls) {
      this.controls.update();
    }
  }

  getScene() {
    return this.scene;
  }

  getCamera() {
    return this.camera;
  }

  getRenderer() {
    return this.renderer;
  }

  getControls() {
    return this.controls;
  }

  dispose() {
    this.stopAnimation();
    
    if (this.resizeHandler) {
      window.removeEventListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }

    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }

    if (this.renderer) {
      if (this.mountElement && this.mountElement.contains(this.renderer.domElement)) {
        this.mountElement.removeChild(this.renderer.domElement);
      }
      this.renderer.dispose();
      this.renderer = null;
    }

    if (this.scene) {
      // Scene will be cleaned up when objects are removed
      this.scene = null;
    }

    this.camera = null;
  }
}

/**
 * Factory function to create SceneManager
 */
export function createSceneManager(mountElement, options) {
  return new SceneManager(mountElement, options);
}
