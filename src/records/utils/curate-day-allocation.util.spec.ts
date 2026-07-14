import { allocateDailyQuotas } from './curate-day-allocation.util';

describe('allocateDailyQuotas', () => {
  it('1일 여행 — 사진이 15장 이상이면 15장 전부 그 하루에 배분한다', () => {
    expect(allocateDailyQuotas([30], 15)).toEqual([15]);
  });

  it('3일 여행 — 하루 5장씩 균등 배분한다(§3.3 표 그대로)', () => {
    expect(allocateDailyQuotas([10, 10, 10], 15)).toEqual([5, 5, 5]);
  });

  it('7일 여행 — 하루 2장 기본 + 남는 몫이 사진 많은 날부터 1장씩 더 붙어 2~3장이 된다', () => {
    const result = allocateDailyQuotas([10, 10, 10, 10, 10, 10, 10], 15);
    expect(result.reduce((a, b) => a + b, 0)).toBe(15);
    expect(result.every((q) => q === 2 || q === 3)).toBe(true);
    expect(result.filter((q) => q === 3)).toHaveLength(1);
  });

  it('10일 이상 여행 — 하루 1장 기본 + 남는 몫이 재분배돼 1~2장이 된다', () => {
    const result = allocateDailyQuotas(new Array(10).fill(10), 15);
    expect(result.reduce((a, b) => a + b, 0)).toBe(15);
    expect(result.every((q) => q === 1 || q === 2)).toBe(true);
    expect(result.filter((q) => q === 2)).toHaveLength(5);
  });

  it('사진이 적은 날짜의 남는 몫을 사진이 많았던 날짜로 재분배한다', () => {
    // 3일 여행, 균등 배분이면 5/5/5인데 둘째 날은 사진이 2장뿐 — 남는 3장을
    // 사진이 더 많은 날짜(첫째/셋째)로 재분배해야 한다.
    const result = allocateDailyQuotas([10, 2, 10], 15);

    expect(result[1]).toBe(2); // 둘째 날은 가진 사진(2장) 이상 뽑을 수 없다
    expect(result[0] + result[2]).toBe(13); // 나머지 몫은 첫째/셋째로 재분배
    expect(result[0]).toBeGreaterThanOrEqual(result[2] - 1);
  });

  it('사진이 많았던 날짜일수록 재분배된 몫을 더 많이 받는다', () => {
    // 둘째 날은 사진 1장뿐이라 몫이 크게 남고, 그 남는 몫은 사진이 가장 많은
    // 첫째 날(20장)에 더 실려야 한다(셋째 날 5장보다 우선).
    const result = allocateDailyQuotas([20, 1, 5], 15);

    expect(result[1]).toBe(1);
    expect(result[0]).toBeGreaterThan(result[2]);
    expect(result[0] + result[1] + result[2]).toBe(15);
  });

  it('전체 사진 수가 totalQuota보다 적으면 있는 만큼만 배분하고 끝낸다(무한루프 없음)', () => {
    const result = allocateDailyQuotas([2, 3], 15);

    expect(result).toEqual([2, 3]);
  });

  it('사진이 하나도 없는 날짜(0장)는 배분에서 자연히 제외된다', () => {
    const result = allocateDailyQuotas([10, 0, 10], 15);

    expect(result[1]).toBe(0);
    expect(result[0] + result[2]).toBe(15);
  });

  it('빈 배열이면 빈 배열을 반환한다', () => {
    expect(allocateDailyQuotas([], 15)).toEqual([]);
  });
});
