/*
 * The api/status response body: source counts with the fixed overdue
 * threshold, and the last healthy collection time. Exported so tests can
 * assert on the payload without importing next/server.
 */
export type StatusPayload = {
  sources: {
    total: number;
    ok: number;
    overdue: number;
    failed: number;
    never: number;
    overdueAfterDays: number;
  };
  lastHealthyAt: string | null;
  success: true;
};

type ErrorPayload = { success: false; error: string };

export function statusPayload(
  summary: { total: number; ok: number; overdue: number; failed: number; never: number },
  overdueAfterDays: number,
  lastHealthyAt: string | null,
): StatusPayload {
  return {
    sources: {
      total: summary.total,
      ok: summary.ok,
      overdue: summary.overdue,
      failed: summary.failed,
      never: summary.never,
      overdueAfterDays,
    },
    lastHealthyAt,
    success: true,
  };
}

/** A database that is down degrades to a 503, it does not take the API with it. */
export function statusUnavailable(): { payload: ErrorPayload; status: number } {
  return { payload: { success: false, error: 'Source health is unavailable.' }, status: 503 };
}