import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Every page reads Postgres per request, so there is no incremental cache to
// keep and nothing to revalidate.
export default defineCloudflareConfig({});
