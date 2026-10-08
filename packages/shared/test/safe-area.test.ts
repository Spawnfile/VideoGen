import { describe, expect, it } from 'vitest';
import { DEFAULT_SAFE_AREA, SafeAreaSchema, safeAreaWarnings, scaleSafeArea, type SafeArea } from '../src/safe-area.ts';
import { layoutIssues, type LayoutManifest } from '../../remotion/src/layout.ts';
import { draftLayout, safeRect } from '../../remotion/src/props.ts';
import { safeAreaFilter } from '../../../apps/worker/src/render/ffmpeg.ts';
import { edgeBandCrops } from '../../../apps/worker/src/render/qc.ts';

/** A calibrated area that differs from the default on every side. */
const MOVED: SafeArea = { top: 200, bottom: 1400, right: 180, left: 40 };

describe('safe area (plan M7 Y15)', () => {
  it('SafeAreaSchema and scaleSafeArea: the default is 150/1510/130/24 at 1080×1920 and scales to 540×960; impossible areas are refused; warnings flag a value more than 150 px from the default', () => {
    expect(DEFAULT_SAFE_AREA).toEqual({ top: 150, bottom: 1510, right: 130, left: 24 });
    expect(SafeAreaSchema.safeParse(DEFAULT_SAFE_AREA).success).toBe(true);
    expect(scaleSafeArea(DEFAULT_SAFE_AREA, 1080, 1920)).toEqual({ top: 150, bottom: 1510, right: 130, left: 24 });
    expect(scaleSafeArea(DEFAULT_SAFE_AREA, 540, 960)).toEqual({ top: 75, bottom: 755, right: 65, left: 12 });
    expect(scaleSafeArea(MOVED, 540, 960)).toEqual({ top: 100, bottom: 700, right: 90, left: 20 });
    for (const bad of [
      { ...DEFAULT_SAFE_AREA, top: -1 },
      { ...DEFAULT_SAFE_AREA, top: 1600 }, // top below bottom
      { ...DEFAULT_SAFE_AREA, bottom: 1921 },
      { ...DEFAULT_SAFE_AREA, left: -4 },
      { ...DEFAULT_SAFE_AREA, left: 540, right: 540 }, // no width left
      { ...DEFAULT_SAFE_AREA, top: 700 }, // 810 px tall: under the 900 px minimum
      { ...DEFAULT_SAFE_AREA, right: 12.5 },
      { top: 150, bottom: 1510, right: 130 },
    ]) expect(SafeAreaSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    expect(SafeAreaSchema.safeParse({ top: 0, bottom: 900, right: 0, left: 0 }).success).toBe(true);
    expect(safeAreaWarnings(DEFAULT_SAFE_AREA)).toEqual([]);
    expect(safeAreaWarnings({ ...DEFAULT_SAFE_AREA, top: 300, right: 280 })).toEqual([]); // exactly 150 px: still fine
    const w = safeAreaWarnings({ ...DEFAULT_SAFE_AREA, top: 301, bottom: 1300 });
    expect(w).toHaveLength(2);
    expect(w[0]).toMatch(/üst.*301.*150/);
    expect(w[1]).toMatch(/alt.*1300.*1510/);
  });

  it('one source: safeRect, layoutIssues (from the manifest\'s safeArea, the default for an old manifest), the contact sheet filter and the qc edge bands all move together when the area changes', () => {
    // safeRect / draftLayout (Remotion layout and the G6 manifest boxes)
    expect(safeRect(1080, 1920)).toEqual({ left: 24, top: 150, right: 950, bottom: 1510 });
    expect(safeRect(1080, 1920, MOVED)).toEqual({ left: 40, top: 200, right: 900, bottom: 1400 });
    expect(safeRect(540, 960, MOVED)).toEqual({ left: 20, top: 100, right: 450, bottom: 700 });
    expect(draftLayout(1080, 1920, MOVED).safe).toEqual(safeRect(1080, 1920, MOVED));
    expect(draftLayout(1080, 1920, MOVED).hookTop).toBe(draftLayout(1080, 1920).hookTop + 50);

    // layoutIssues: the hook plate at y 170 is inside the default area, outside the moved one; an old manifest has no safeArea.
    const old: LayoutManifest = { width: 1080, height: 1920, fps: 30, frames: [{ frame: 0, boxes: [{ kind: 'hook', box: [40, 170, 600, 260] }] }] };
    expect(layoutIssues(old)).toEqual([]);
    expect(layoutIssues({ ...old, safeArea: DEFAULT_SAFE_AREA })).toEqual([]);
    expect(layoutIssues({ ...old, safeArea: MOVED })).toEqual([{ frame: 0, kind: 'hook', box: [40, 170, 600, 260] }]);

    // Contact sheet overlay (relative to the frame, so any still size)
    expect(safeAreaFilter()).toBe([
      'drawbox=x=0:y=0:w=iw:h=ih*150/1920:color=red@0.22:t=fill',
      'drawbox=x=0:y=ih*1510/1920:w=iw:h=ih-ih*1510/1920:color=red@0.22:t=fill',
      'drawbox=x=iw-iw*130/1080:y=0:w=iw*130/1080:h=ih:color=red@0.22:t=fill',
    ].join(','));
    expect(safeAreaFilter(MOVED)).toBe([
      'drawbox=x=0:y=0:w=iw:h=ih*200/1920:color=red@0.22:t=fill',
      'drawbox=x=0:y=ih*1400/1920:w=iw:h=ih-ih*1400/1920:color=red@0.22:t=fill',
      'drawbox=x=iw-iw*180/1080:y=0:w=iw*180/1080:h=ih:color=red@0.22:t=fill',
    ].join(','));

    // qc edge-density bands (used when a final has no layout.json)
    expect(edgeBandCrops()).toEqual(['iw:ih*150/1920:0:0', 'iw:ih-ih*1510/1920:0:ih*1510/1920', 'iw*130/1080:ih:iw-iw*130/1080:0']);
    expect(edgeBandCrops(MOVED)).toEqual(['iw:ih*200/1920:0:0', 'iw:ih-ih*1400/1920:0:ih*1400/1920', 'iw*180/1080:ih:iw-iw*180/1080:0']);
  });
});
