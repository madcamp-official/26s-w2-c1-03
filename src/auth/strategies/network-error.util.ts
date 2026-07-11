const NETWORK_ERROR_CODES = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET']);

/** fetch/라이브러리가 던진 에러가 DNS/연결/타임아웃류인지 판별 — PROVIDER_ERROR와 구분용. */
export function isNetworkError(error: unknown): boolean {
  const code =
    (error as { cause?: { code?: string }; code?: string } | undefined)?.cause?.code ??
    (error as { code?: string } | undefined)?.code;
  return typeof code === 'string' && NETWORK_ERROR_CODES.has(code);
}
