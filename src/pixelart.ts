/* =============================================================================
 * SimEarth 2.0 — pixel-art pictures
 * -----------------------------------------------------------------------------
 * Draws an SVG (asset URL or inline markup) into a small canvas; the CSS scales
 * it up with `image-rendering: pixelated`, so the big pictures read as pixel
 * art while staying the same drawings. Display size comes from the element's
 * CSS class: pick `size` so that size is a clean 2× or 3× of it.
 * ========================================================================== */

namespace SE {
  /** `src` is an image URL or an `<svg …>` string; `alt` makes the canvas a labelled image. */
  export function pixelArt(src: string, size: number, cls = '', alt = ''): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    canvas.className = `pixel-art ${cls}`.trim();
    if (alt) {
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', alt);
    } else canvas.setAttribute('aria-hidden', 'true');
    const url = src.startsWith('<') ? svgDataUrl(src, size) : src;
    // Under file:// an asset URL taints the canvas; harmless, nothing reads it back.
    const draw = (image: HTMLImageElement): void => canvas.getContext('2d')?.drawImage(image, 0, 0, size, size);
    // Panels that rebuild while the game runs (Examine) would otherwise blank every picture until the async load.
    const cached = loadedArt.get(url);
    if (cached) {
      draw(cached);
      return canvas;
    }
    const image = new Image();
    image.onload = () => {
      if (loadedArt.size >= 400) loadedArt.clear(); // ponytail: crude cap, an LRU if pictures ever churn
      loadedArt.set(url, image);
      draw(image);
    };
    image.src = url;
    return canvas;
  }

  const loadedArt = new Map<string, HTMLImageElement>();

  /** Inline SVG strings carry only a viewBox: without xmlns they don't load as an image, without width/height Chrome rasterizes them at 300×150. */
  function svgDataUrl(svg: string, size: number): string {
    const root = svg.includes('xmlns=') ? svg : svg.replace('<svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"`);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(root)}`;
  }
}
