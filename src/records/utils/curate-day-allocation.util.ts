/**
 * 여행 일수 기준 동적 배분(API 명세서 §4, 기능명세서 §3.3) — 하루당 몫을
 * 균등하게 나누되, 어떤 날짜의 사진 수가 몫보다 적으면 남는 몫을 사진이
 * 많았던 날짜로 재분배한다("가중치 재분배"). [dayPhotoCounts]는 일자별
 * 업로드된 사진 수(순서는 호출부의 날짜 그룹 순서와 대응), 반환값은 같은
 * 순서의 일자별 배분 장수 — 합계는 항상 min(totalQuota, sum(dayPhotoCounts))다.
 *
 * 손으로 검증하기 어려운 로직이라(plan.md §13) 여기서 순수 함수로 분리해
 * curate-day-allocation.util.spec.ts에서 배분 표(§3.3)의 각 케이스를 직접
 * 검증한다.
 */
export function allocateDailyQuotas(dayPhotoCounts: number[], totalQuota: number): number[] {
  const quotas = new Array<number>(dayPhotoCounts.length).fill(0);
  let remaining = Math.max(0, totalQuota);
  let active = dayPhotoCounts.map((_, index) => index).filter((index) => dayPhotoCounts[index] > 0);

  while (remaining > 0 && active.length > 0) {
    // 사진이 많은 날짜부터 이번 라운드의 몫을 우선 배분한다 — 사진이 적은
    // 날짜가 먼저 바닥나 남는 몫이 사진 많은 날짜로 자연스럽게 재분배되게
    // 하기 위함이다.
    active.sort((a, b) => dayPhotoCounts[b] - dayPhotoCounts[a]);
    const share = Math.max(1, Math.floor(remaining / active.length));
    let allocatedThisRound = 0;

    for (const index of active) {
      if (remaining <= 0) break;
      const capacity = dayPhotoCounts[index] - quotas[index];
      if (capacity <= 0) continue;
      const give = Math.min(share, capacity, remaining);
      quotas[index] += give;
      remaining -= give;
      allocatedThisRound += give;
    }

    active = active.filter((index) => dayPhotoCounts[index] - quotas[index] > 0);
    if (allocatedThisRound === 0) break; // 전체 용량 소진(모든 날짜가 사진 수만큼 다 찼음)
  }

  return quotas;
}
