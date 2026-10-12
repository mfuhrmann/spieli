import { test, expect } from '@playwright/test';
import { injectApiConfig, stubApiRoutes } from './helpers.js';

/**
 * #935 — canvas-rendered rings drew in CSS units into OpenLayers' device-pixel
 * context, so they came out at 1/devicePixelRatio size. The fix scales the
 * drawing and supplies a 1:1 hitDetectionRenderer. Hit detection already ran
 * at CSS size before the fix, so this does not catch the visual bug — it
 * guards the part the fix could break: a ring stays clickable across its CSS
 * radius at both ratios. The visual size was checked by screenshot.
 */

const LON = 9.675, LAT = 50.551;
const CLUSTERS = [{ lon: LON, lat: LAT, count: 25, complete: 5, partial: 10, missing: 10 }];

for (const dpr of [1, 2]) {
  test.describe(`devicePixelRatio ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });

    test('clicking a cluster ring zooms in', async ({ page }) => {
      await injectApiConfig(page, { clusterMaxZoom: 20 });
      await stubApiRoutes(page, undefined, CLUSTERS);
      await page.goto('/');
      const pixel = await page.waitForFunction(([lon, lat]) => {
        const map = window.__spieli?.map;
        const layer = map?.getLayers().getArray().find(l => l.getZIndex?.() === 12);
        if (!layer?.getSource()?.getFeatures().length) return null;
        const R = 6378137;
        const c = [lon * Math.PI / 180 * R, Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * R];
        map.getView().setCenter(c);
        map.renderSync();
        return map.getPixelFromCoordinate(c);
      }, [LON, LAT]).then(h => h.jsonValue());
      const before = await page.evaluate(() => window.__spieli.map.getView().getZoom());
      const box = await page.locator('.map-container').boundingBox();
      // 20 CSS px from the centre: on the ring at its CSS size (radius 22 for
      // count 25). A hit-detection renderer scaled by the screen's ratio
      // would miss here at ratio 2.
      await page.mouse.click(box.x + pixel[0] + 20, box.y + pixel[1]);
      await expect.poll(() => page.evaluate(() => window.__spieli.map.getView().getZoom()))
        .toBeGreaterThan(before + 1);
    });
  });
}
