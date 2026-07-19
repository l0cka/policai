/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getAgencies,
  getCommonwealthAgencies,
  getDevelopments,
  getPolicyFrameworkArtifact,
  getPolicies,
  getTimelineEvents,
} = vi.hoisted(() => ({
  getAgencies: vi.fn(),
  getCommonwealthAgencies: vi.fn(),
  getDevelopments: vi.fn(),
  getPolicyFrameworkArtifact: vi.fn(),
  getPolicies: vi.fn(),
  getTimelineEvents: vi.fn(),
}));

vi.mock('@/lib/data-service', () => ({
  getAgencies,
  getCommonwealthAgencies,
  getDevelopments,
  getPolicyFrameworkArtifact,
  getPolicies,
  getTimelineEvents,
}));

import { GET as getAgenciesJson } from './agencies.json/route';
import { GET as getCommonwealthAgenciesJson } from './commonwealth-agencies.json/route';
import { GET as getDevelopmentsJson } from './developments.json/route';
import { GET as getFrameworkJson } from './dta-ai-policy-framework.json/route';
import {
  dynamic as policiesJsonDynamic,
  GET as getPoliciesJson,
  revalidate as policiesJsonRevalidate,
} from './policies.json/route';
import { GET as getTimelineJson } from './timeline.json/route';

describe('/data editorial JSON routes', () => {
  beforeEach(() => {
    getAgencies.mockReset();
    getCommonwealthAgencies.mockReset();
    getDevelopments.mockReset();
    getPolicyFrameworkArtifact.mockReset();
    getPolicies.mockReset();
    getTimelineEvents.mockReset();
  });

  it('publishes filtered JSON through hourly static revalidation', () => {
    expect(policiesJsonDynamic).toBe('force-static');
    expect(policiesJsonRevalidate).toBe(3600);
  });

  it('serves only the filtered public policy projection', async () => {
    const policies = [{ id: 'verified-public-policy' }];
    getPolicies.mockResolvedValue(policies);

    await expect((await getPoliciesJson()).json()).resolves.toEqual(policies);
    expect(getPolicies).toHaveBeenCalledOnce();
  });

  it('serves only the filtered public developments projection', async () => {
    const developments = [{ id: 'public-development' }];
    getDevelopments.mockResolvedValue(developments);

    await expect((await getDevelopmentsJson()).json()).resolves.toEqual(
      developments,
    );
    expect(getDevelopments).toHaveBeenCalledOnce();
  });

  it('withholds the framework artifact with its related policy', async () => {
    getPolicyFrameworkArtifact.mockResolvedValue(null);

    const response = await getFrameworkJson();

    expect(response.status).toBe(404);
  });

  it('serves only the public agency projection', async () => {
    const agencies = [{ id: 'public-agency' }];
    getAgencies.mockResolvedValue(agencies);
    getCommonwealthAgencies.mockResolvedValue(agencies);

    await expect((await getAgenciesJson()).json()).resolves.toEqual(agencies);
    await expect(
      (await getCommonwealthAgenciesJson()).json(),
    ).resolves.toEqual(agencies);
  });

  it('serves only verified manual timeline records', async () => {
    const events = [{ id: 'verified-event' }];
    getTimelineEvents.mockResolvedValue(events);

    await expect((await getTimelineJson()).json()).resolves.toEqual(events);
    expect(getTimelineEvents).toHaveBeenCalledWith(undefined, {
      includeGenerated: false,
    });
  });
});
