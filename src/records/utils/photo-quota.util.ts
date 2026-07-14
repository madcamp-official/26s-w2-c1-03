export interface DayPhotoGroup {
  date: string;
  count: number;
}

/**
 * 여행 일수/사진 분포에 따라 일별 curate 목표 장수를 배분한다(기능명세서 §3.3,
 * §13 — 손으로 검증하기 어려운 로직이라 유닛테스트 필수). 각 날짜의 사진 비중에
 * 비례해 최대 나머지법으로 배분하되, 그 날짜의 실제 사진 수(capacity)를 넘지
 * 않는다. 배분하지 못한 몫은 다음 라운드에서 아직 여유가 있는(사진이 많이
 * 남은) 날짜로 재분배한다 — "사진이 적은 날짜가 있을 경우, 사진이 많았던
 * 날짜에 가중치를 재분배"와 일치.
 */
export function allocatePhotoQuota(groups: DayPhotoGroup[], target = 15): Map<string, number> {
  const nonEmpty = groups.filter((g) => g.count > 0);
  const quota = new Map<string, number>(nonEmpty.map((g) => [g.date, 0]));
  if (nonEmpty.length === 0) {
    return quota;
  }

  const totalPhotos = nonEmpty.reduce((sum, g) => sum + g.count, 0);
  let remaining = Math.min(target, totalPhotos);

  while (remaining > 0) {
    const active = nonEmpty.filter((g) => g.count - quota.get(g.date)! > 0);
    if (active.length === 0) {
      break;
    }

    const activeTotal = active.reduce((sum, g) => sum + g.count, 0);
    const shares = active.map((g) => {
      const capacity = g.count - quota.get(g.date)!;
      const raw = (g.count / activeTotal) * remaining;
      const floor = Math.min(Math.floor(raw), capacity);
      return { date: g.date, floor, capacity, remainder: raw - Math.floor(raw) };
    });

    let allocated = 0;
    for (const s of shares) {
      quota.set(s.date, quota.get(s.date)! + s.floor);
      allocated += s.floor;
    }

    let leftover = remaining - allocated;
    if (leftover > 0) {
      const byRemainderDesc = [...shares]
        .filter((s) => s.floor < s.capacity)
        .sort((a, b) => b.remainder - a.remainder);
      for (const s of byRemainderDesc) {
        if (leftover <= 0) break;
        quota.set(s.date, quota.get(s.date)! + 1);
        leftover -= 1;
        allocated += 1;
      }
    }

    remaining -= allocated;
    if (allocated === 0) {
      break; // capacity가 다 찼는데도 못 배분하면 무한루프 방지용 안전장치
    }
  }

  return quota;
}
