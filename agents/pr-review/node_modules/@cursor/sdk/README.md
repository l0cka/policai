# @cursor/sdk

TypeScript SDK for Cursor agents.

Documentation: https://cursor.com/docs/api/sdk/typescript

## No-repo cloud agents

Cloud agents can run on an empty VM with no repository. Pass `cloud` (omitting
it selects the local platform) and leave `repos` unset:

```ts
const agent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY,
  cloud: { repos: [] },
});
```

No-repo agents must be enabled for your account or team, and repository-scoped
API keys cannot create them.
