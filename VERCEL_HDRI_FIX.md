# Fixing HDRI 404 Errors on Vercel

## Problem
Vercel returns 404 for `/assets/hdr/studio3.hdr` even though the file exists in git and works locally.

## Root Cause
Vercel may exclude large binary files (6.5MB+) from deployments, or the file might not be properly included in the build output.

## Solutions

### Solution 1: Verify File is in GitHub (Quick Check)
1. Go to: `https://github.com/dmustaqeem/ArtworkFrametest/tree/main/public/assets/hdr`
2. Verify `studio3.hdr` exists in the repository
3. If missing, push it:
   ```bash
   git add public/assets/hdr/studio3.hdr
   git commit -m "Add HDR files"
   git push
   ```

### Solution 2: Host HDR Files Externally (Recommended)
Since large binary files can cause issues on Vercel, host them externally:

#### Option A: Use a CDN (Cloudflare, etc.)
1. Upload `studio3.hdr` and `studio2.hdr` to your CDN
2. Get the public URLs
3. In Vercel Dashboard → Settings → Environment Variables, add:
   - `VITE_HDRI_URL` = `https://your-cdn.com/assets/hdr/studio3.hdr`
   - `VITE_HDRI_MIRROR_URL` = `https://your-cdn.com/assets/hdr/studio2.hdr`
4. Redeploy

#### Option B: Use GitHub Releases or Raw GitHub URLs
1. Create a GitHub release and attach the HDR files
2. Use the raw GitHub URLs:
   - `VITE_HDRI_URL` = `https://github.com/dmustaqeem/ArtworkFrametest/releases/download/v1.0/studio3.hdr`
   - `VITE_HDRI_MIRROR_URL` = `https://github.com/dmustaqeem/ArtworkFrametest/releases/download/v1.0/studio2.hdr`

#### Option C: Use AWS S3 or Similar
1. Upload files to S3 bucket
2. Make them publicly accessible
3. Use S3 URLs in environment variables

### Solution 3: Check Vercel Build Logs
1. Go to Vercel Dashboard → Your Project → Deployments
2. Click on the latest deployment
3. Check "Build Logs" for warnings about file size or missing files
4. Look for any errors related to `studio3.hdr`

## Current Configuration
The app now supports environment variables:
- `VITE_HDRI_URL` - Overrides default HDRI path
- `VITE_HDRI_MIRROR_URL` - Overrides mirror HDRI path

If these are not set, it falls back to local paths (`/assets/hdr/studio3.hdr`).

## Testing
After setting environment variables:
1. Redeploy on Vercel
2. Check browser console - should see HDRI loading successfully
3. Verify the URL in network tab matches your external URL
