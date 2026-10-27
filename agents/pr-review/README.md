# Policai PR review (Agent SDK trial)

A code version of the Cursor Automation [Policai PR review](https://cursor.com/automations/e78b9267-d0fa-11f1-89ee-7aa6f0729b11). The automation stays enabled. Nothing here is deployed.

`automation-prompt.md` is the prompt taken from a live run. `bot/instructions.md` tells the model how to call `post_review`. The tool builds the review body:

- GitHub review event is always `COMMENT`.
- Zero remaining blockers write `<!-- cursor-review: success -->`. Any remaining blocker writes `<!-- cursor-review: failure -->`.
- The body contains that marker once.
- Each review starts with `<!-- policai-pr-review -->`. The blockers on this agent's newest review, and only that review, go to the model as `pr/prior-blockers.json` with ids. The model passes the ids still true as `stillOpen`, and each becomes one `Still open` line. A blocker repeated under its old path and title is folded into the same line. Blockers are never filtered by title.
- A diff over 150,000 characters is cut file by file, code first and lockfiles last. Any file that does not fit is listed as unread, and the review fails.
- The diff and the review's `commit_id` are pinned to the head SHA read at the start of the session, `AGENTS.md` is read from the base so a pull request cannot rewrite its own rules, and earlier reviews are read only from bot accounts.

The channel wakes on `pull_request` `opened`, `reopened`, `synchronize` and `ready_for_review` for `l0cka/policai`, the same events on which the stamp workflow opens a waiting check, and skips drafts. It loads `AGENTS.md` from the base, the pull request diff, and earlier review bodies into the workspace. It does not check out the repository, so the model cannot read code outside the diff.

## Checks

```bash
cd agents/pr-review
npm install
npm run check
npx agent-sdk validate --dir .
npx agent-sdk eval --dir . --list
```

`agent-sdk eval` runs model turns and needs `agent-sdk login`. A browser sign-in was not available in the environment that added this project, so the eval cases are written and listed, and were not executed there.

## What deploying would take

Do this only after review. Do not deploy as part of the trial.

1. `agent-sdk login` as a Cursor account that can deploy for this team.
2. From `agents/pr-review`, `npx agent-sdk validate --dir .` then `npx agent-sdk deploy --repo https://github.com/l0cka/policai --ref <reviewed-sha> --path agents/pr-review`.
3. In Deployed Agents, connect GitHub for `l0cka/policai` with permission to create a pull request review (`pr-write`). Cursor-account delivery covers pull request events, so no GitHub App webhook is required for `opened` and `synchronize`.
4. Disable the dashboard automation only after a replay (`npx agent-sdk github replay l0cka/policai#<pr> --dir agents/pr-review --action opened`) shows one `COMMENT` review on the head SHA. Until then both reviewers would post.

The stamp workflow (`.github/workflows/cursor-review.yml`, PR #551) completes `cursor-review` only when the review author is `cursor[bot]` with type `Bot`. A deployed Agent SDK agent posts as its own GitHub identity. If that identity is not `cursor[bot]`, the marker in its review does not complete the check. Deploying does not replace the automation until that trust rule is changed or the agent is granted the `cursor[bot]` identity, which this trial does not do.
