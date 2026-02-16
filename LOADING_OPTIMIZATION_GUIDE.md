# Scene Loading Optimization Guide

## Potential Reasons for Slow Scene Loading

### 1. **Sequential Asset Loading** ✅ FIXED
- **Issue**: HDRI and model loaded sequentially instead of in parallel
- **Impact**: Adds 2-5+ seconds to load time
- **Fix**: Implemented parallel loading - both start simultaneously
- **Location**: `src/viewer/useArtworkViewer.jsx` lines 520-610

### 2. **Large HDRI Files**
- **Issue**: HDR files are typically 2-10MB uncompressed
- **Impact**: Slow download and PMREM processing blocks main thread
- **Solutions**:
  - Use compressed HDRIs (EXR with compression, or smaller resolution)
  - Consider using `.exr` format (better compression than `.hdr`)
  - Reduce HDRI resolution (2048x1024 instead of 4096x2048)
  - Use lower quality HDRIs for faster loading

### 3. **Large GLB Model Files**
- **Issue**: Uncompressed or unoptimized GLB files
- **Impact**: Slow download and parsing
- **Solutions**:
  - Use Draco compression (already configured)
  - Optimize models in Blender/glTF-Pipeline:
    ```bash
    gltf-pipeline -i input.glb -o output.glb -d
    ```
  - Remove unused materials/textures
  - Reduce texture sizes in models

### 4. **PMREM Generation Blocking**
- **Issue**: PMREM generation is CPU-intensive and blocks main thread
- **Impact**: Freezes UI during HDRI processing
- **Status**: Already optimized with `requestAnimationFrame` (line 289 in EnvironmentManager)
- **Additional**: Consider using lower PMREM resolution for faster processing

### 5. **No Build Optimizations** ✅ FIXED
- **Issue**: Minimal Vite config, no code splitting
- **Impact**: Large bundle size, slower initial load
- **Fix**: Added code splitting, minification, chunk optimization
- **Location**: `vite.config.js`

### 6. **No Asset Compression**
- **Issue**: Assets not compressed (gzip/brotli)
- **Impact**: 50-70% larger file sizes
- **Solutions**:
  - Enable gzip/brotli on server/CDN
  - For Vercel: Automatic (already enabled)
  - For other hosts: Configure compression middleware

### 7. **No CDN/Caching**
- **Issue**: Assets served from same origin, no caching headers
- **Impact**: Slower downloads, repeated downloads
- **Solutions**:
  - Use CDN (Cloudflare, AWS CloudFront)
  - Set proper cache headers:
    ```
    Cache-Control: public, max-age=31536000, immutable
    ```
  - For Vercel: Add `vercel.json`:
    ```json
    {
      "headers": [
        {
          "source": "/assets/(.*)",
          "headers": [
            {
              "key": "Cache-Control",
              "value": "public, max-age=31536000, immutable"
            }
          ]
        }
      ]
    }
    ```

### 8. **Synchronous Material Processing**
- **Issue**: Material processing happens synchronously during load
- **Impact**: Blocks rendering
- **Status**: Already optimized with MeshCache
- **Additional**: Consider deferring non-critical material updates

### 9. **No Lazy Loading**
- **Issue**: All assets load upfront
- **Impact**: Slow initial load
- **Solutions**:
  - Lazy load test textures
  - Lazy load non-critical components
  - Use React.lazy() for code splitting

### 10. **Network Latency**
- **Issue**: Slow server/CDN response times
- **Impact**: High latency adds to load time
- **Solutions**:
  - Use CDN with edge locations
  - Enable HTTP/2 or HTTP/3
  - Use service worker for caching

## Immediate Actions to Take

### High Priority (Quick Wins)

1. **Enable Asset Compression** (if not already)
   - Vercel: Automatic
   - Other hosts: Configure gzip/brotli

2. **Add Cache Headers** (if not already)
   - Create/update `vercel.json` with cache headers
   - Or configure on your hosting platform

3. **Optimize HDRI Files**
   - Reduce resolution to 2048x1024 or 1024x512
   - Use EXR format with compression
   - Test quality vs. file size tradeoff

4. **Optimize GLB Models**
   - Ensure Draco compression is enabled
   - Remove unused materials/textures
   - Reduce texture sizes

### Medium Priority

5. **Use CDN**
   - Move assets to CDN (Cloudflare, AWS CloudFront)
   - Update paths in `appConfig.jsx` if needed

6. **Implement Loading States**
   - Show progress indicators
   - Display what's loading (HDRI, Model, etc.)

7. **Preload Critical Assets**
   - Add `<link rel="preload">` for critical assets
   - Preconnect to CDN domains

### Low Priority (Long-term)

8. **Code Splitting**
   - Lazy load non-critical components
   - Split Three.js into separate chunks (already done)

9. **Service Worker**
   - Cache assets for offline/repeat visits
   - Implement cache-first strategy

10. **Progressive Loading**
    - Load low-res model first, then high-res
    - Load low-res HDRI first, then high-res

## Performance Targets

- **Initial Load**: < 3 seconds (first contentful paint)
- **Scene Ready**: < 5 seconds (model + HDRI loaded)
- **Interactive**: < 2 seconds after scene ready

## Monitoring

Use browser DevTools to identify bottlenecks:
1. **Network Tab**: Check download times, file sizes
2. **Performance Tab**: Identify blocking operations
3. **Lighthouse**: Get performance score and recommendations

## Testing

Test loading performance:
1. **Slow 3G**: Simulate slow network
2. **Throttled CPU**: Simulate slow devices
3. **Different Locations**: Test from different regions
