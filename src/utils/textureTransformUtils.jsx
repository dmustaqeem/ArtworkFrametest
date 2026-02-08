import * as THREE from "three";

/**
 * Texture transform utility functions
 * Handles texture transformations (crop, scale, rotate)
 */

/**
 * Apply texture transform to an image
 * @param {HTMLImageElement|string} imageSource - Image element or image URL
 * @param {Object} transform - Transform parameters
 * @param {number} transform.translateX - X translation in pixels
 * @param {number} transform.translateY - Y translation in pixels
 * @param {number} transform.scaleX - X scale factor
 * @param {number} transform.scaleY - Y scale factor
 * @param {number} transform.rotationDeg - Rotation in degrees
 * @param {Object} selectionRect - Selection rectangle { x, y, width, height }
 * @param {number} outputWidth - Output canvas width (default: 2048)
 * @param {number} outputHeight - Output canvas height (default: 2048)
 * @returns {HTMLCanvasElement} Transformed canvas
 */
export function applyTextureTransform(
  imageSource,
  transform,
  selectionRect,
  outputWidth = 2048,
  outputHeight = 2048
) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext("2d");

      // Calculate image dimensions and scale
      const imgAspect = img.width / img.height;
      const canvasAspect = canvas.width / canvas.height;
      let baseScale = 1;

      if (imgAspect > canvasAspect) {
        baseScale = canvas.width / img.width;
      } else {
        baseScale = canvas.height / img.height;
      }

      // Apply base scale
      const scaledWidth = img.width * baseScale;
      const scaledHeight = img.height * baseScale;

      // Center image
      let centerX = canvas.width / 2;
      let centerY = canvas.height / 2;

      // Apply transforms
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate((transform.rotationDeg * Math.PI) / 180);
      ctx.scale(transform.scaleX, transform.scaleY);
      ctx.translate(transform.translateX, transform.translateY);
      ctx.translate(-scaledWidth / 2, -scaledHeight / 2);

      // Draw image
      ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);
      ctx.restore();

      // Crop to selection rectangle if provided
      if (selectionRect) {
        const croppedCanvas = document.createElement("canvas");
        croppedCanvas.width = selectionRect.width;
        croppedCanvas.height = selectionRect.height;
        const croppedCtx = croppedCanvas.getContext("2d");

        croppedCtx.drawImage(
          canvas,
          selectionRect.x,
          selectionRect.y,
          selectionRect.width,
          selectionRect.height,
          0,
          0,
          selectionRect.width,
          selectionRect.height
        );

        resolve(croppedCanvas);
      } else {
        resolve(canvas);
      }
    };

    img.onerror = () => reject(new Error("Failed to load image"));

    if (typeof imageSource === "string") {
      img.src = imageSource;
    } else if (imageSource instanceof HTMLImageElement) {
      img.src = imageSource.src;
    } else if (imageSource instanceof HTMLCanvasElement) {
      img.src = imageSource.toDataURL();
    } else {
      reject(new Error("Invalid image source"));
    }
  });
}

/**
 * Export texture from canvas as data URL
 * @param {HTMLCanvasElement} canvas - Canvas to export
 * @param {string} format - Image format (default: "image/png")
 * @param {number} quality - Quality for JPEG (0-1, default: 1)
 * @returns {string} Data URL
 */
export function exportTextureFromCanvas(canvas, format = "image/png", quality = 1) {
  return canvas.toDataURL(format, quality);
}
