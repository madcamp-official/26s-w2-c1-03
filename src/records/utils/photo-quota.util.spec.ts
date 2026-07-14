import { allocatePhotoQuota } from './photo-quota.util';

describe('allocatePhotoQuota', () => {
  it('그룹이 없으면 빈 맵을 반환한다', () => {
    expect(allocatePhotoQuota([])).toEqual(new Map());
  });

  it('사진이 0장인 날짜는 결과에서 제외한다', () => {
    const result = allocatePhotoQuota([{ date: '2026-07-01', count: 0 }]);
    expect(result.size).toBe(0);
  });

  it('1일 여행(사진 40장, target 15) → 15장 전부 하루에 배분한다', () => {
    const result = allocatePhotoQuota([{ date: '2026-07-01', count: 40 }]);
    expect(result.get('2026-07-01')).toBe(15);
    expect(sum(result)).toBe(15);
  });

  it('3일 여행, 날짜별 사진 수가 같으면(20/20/20) 5/5/5로 균등 배분한다 — 명세서 §3.3 예시와 일치', () => {
    const result = allocatePhotoQuota([
      { date: '2026-07-01', count: 20 },
      { date: '2026-07-02', count: 20 },
      { date: '2026-07-03', count: 20 },
    ]);
    expect(result.get('2026-07-01')).toBe(5);
    expect(result.get('2026-07-02')).toBe(5);
    expect(result.get('2026-07-03')).toBe(5);
    expect(sum(result)).toBe(15);
  });

  it('사진이 적은 날짜의 부족분을 사진이 많은 날짜로 재분배한다', () => {
    const result = allocatePhotoQuota([
      { date: '2026-07-01', count: 2 },
      { date: '2026-07-02', count: 50 },
      { date: '2026-07-03', count: 1 },
    ]);
    // 총합은 target(15)을 채우되, 사진이 압도적으로 많은 날짜(07-02)가 대부분을 가져간다.
    expect(sum(result)).toBe(15);
    expect(result.get('2026-07-02')!).toBeGreaterThanOrEqual(13);
    expect(result.get('2026-07-01')!).toBeLessThanOrEqual(result.get('2026-07-02')!);
  });

  it('어떤 날짜도 배분량을 자기 사진 수보다 많이 받지 않는다', () => {
    const groups = [
      { date: '2026-07-01', count: 1 },
      { date: '2026-07-02', count: 2 },
      { date: '2026-07-03', count: 3 },
    ];
    const result = allocatePhotoQuota(groups);
    for (const g of groups) {
      expect(result.get(g.date)!).toBeLessThanOrEqual(g.count);
    }
  });

  it('전체 사진 수가 target보다 적으면 있는 만큼만 배분한다', () => {
    const result = allocatePhotoQuota([
      { date: '2026-07-01', count: 3 },
      { date: '2026-07-02', count: 4 },
    ]);
    expect(sum(result)).toBe(7);
    expect(result.get('2026-07-01')).toBe(3);
    expect(result.get('2026-07-02')).toBe(4);
  });

  it('target을 다르게 주면 그 값 기준으로 배분한다', () => {
    const result = allocatePhotoQuota([{ date: '2026-07-01', count: 100 }], 5);
    expect(result.get('2026-07-01')).toBe(5);
  });
});

function sum(quota: Map<string, number>): number {
  return [...quota.values()].reduce((a, b) => a + b, 0);
}
