// Style options for a custom canvas renderer that draws in CSS pixels.
//
// OpenLayers hands a custom `renderer` pixel coordinates in *device* pixels
// and an unscaled context, plus `state.pixelRatio`. A renderer that draws
// radii and bitmaps in CSS pixels therefore comes out at 1/devicePixelRatio
// of its intended size on phones and HiDPI screens. Hit detection reuses the
// same renderer, but on a 1:1 context with CSS-pixel coordinates — while
// still reporting the screen's pixelRatio — so a renderer cannot simply scale
// by state.pixelRatio itself.
//
// hidpiStyleOptions(render) wraps a renderer written in CSS pixels: it scales
// the context for drawing and supplies an unscaled hitDetectionRenderer. Inside
// `render`, state.pixelRatio is the resolution to rasterise bitmaps at; all
// coordinates and sizes are CSS pixels.

function run(render, coords, state, pixelRatio) {
  if (pixelRatio === 1) {
    render(coords, state.pixelRatio === 1 ? state : { ...state, pixelRatio: 1 });
    return;
  }
  const ctx = state.context;
  ctx.save();
  ctx.scale(pixelRatio, pixelRatio);
  const css = Array.isArray(coords[0])
    ? coords.map(([x, y]) => [x / pixelRatio, y / pixelRatio])
    : [coords[0] / pixelRatio, coords[1] / pixelRatio];
  render(css, { ...state, pixelRatio });
  ctx.restore();
}

/** `{ renderer, hitDetectionRenderer }` for a renderer that draws in CSS pixels. */
export function hidpiStyleOptions(render) {
  return {
    renderer: (coords, state) => run(render, coords, state, state.pixelRatio || 1),
    hitDetectionRenderer: (coords, state) => run(render, coords, state, 1),
  };
}
