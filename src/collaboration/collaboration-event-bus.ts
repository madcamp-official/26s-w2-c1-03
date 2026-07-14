import { Injectable, Logger } from '@nestjs/common';

export interface CollaborationEvent {
  tripId: string;
  /** WS 이벤트명(§3.2): member:joined | member:left | schedule:generated | schedule:changed */
  event: string;
  payload: unknown;
}

/**
 * 도메인 서비스(Trips/Schedule) → CollaborationGateway 단방향 이벤트 버스.
 * TripsService가 Gateway를 직접 주입하면 CollaborationModule ↔ TripsModule 순환
 * 의존이 생기므로(§3.2 Gateway가 TripsService로 소속 검증), 의존 없는 이 버스를
 * 사이에 둔다. 도메인 쪽은 emit만 하고 Gateway가 구독해 room으로 브로드캐스트한다.
 * WS 미기동/리스너 오류가 REST 요청을 실패시키지 않도록 예외를 삼킨다.
 */
@Injectable()
export class CollaborationEventBus {
  private readonly logger = new Logger(CollaborationEventBus.name);
  private readonly listeners = new Set<(event: CollaborationEvent) => void>();

  subscribe(listener: (event: CollaborationEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: CollaborationEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.warn(`collaboration 이벤트 리스너 실패(${event.event}): ${String(error)}`);
      }
    }
  }
}
