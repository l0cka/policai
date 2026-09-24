import { NextResponse } from 'next/server';
import { getPool } from '../../../lib/db';
import {
  getLastHealthyAt,
  SOURCE_HEALTH_SQL,
  SOURCE_OVERDUE_DAYS,
  summarizeSourceHealth,
  type SourceHealthRow,
} from '../../../lib/health-data';
import { statusPayload, statusUnavailable } from '../../../lib/status-payload';

export const dynamic = 'force-dynamic';

/**
 * Read-only machine-readable health JSON, in the shape of the register's
 * /api/status (src/app/api/status/route.ts): source counts, overdue once the
 * dashboard's fixed threshold applies, and the last healthy collection time.
 * Aggregates come from the same module the /health page reads, so the two
 * cannot report different figures. GET is the only method; there are no
 * writes behind this endpoint.
 */
export async function GET() {
  try {
    const { rows } = await getPool().query<SourceHealthRow>(SOURCE_HEALTH_SQL);
    const summary = summarizeSourceHealth(rows);
    const lastHealthyAt = await getLastHealthyAt(getPool());
    return NextResponse.json(statusPayload(summary, SOURCE_OVERDUE_DAYS, lastHealthyAt));
  } catch {
    const { payload, status } = statusUnavailable();
    return NextResponse.json(payload, { status });
  }
}