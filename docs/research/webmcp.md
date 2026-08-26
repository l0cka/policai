# WebMCP research note

**Status at 26 August 2026:** WebMCP is a Web Machine Learning Community Group draft. It is not a W3C Standard or on the W3C Standards Track. Policai should therefore add it as progressive enhancement only. The site must keep working when the API is absent. [WebMCP status](https://webmachinelearning.github.io/webmcp/#status-of-this-document)

## Recommended Policai scope

The first implementation should expose the smallest useful set of existing
public, read-only functions:

- `search_policies`;
- `get_policy`;
- `list_developments`.

The WebMCP callbacks should call the same public API and filtering paths as the
site. The developments tool must say that radar detections may need editorial
review and return each item's verification status. Timeline, agency and status
tools can be added if a real consumer needs them. WebMCP should not expose
staging, approval, publication, rejection, source review or collector controls.
This preserves the existing editorial boundary.

Use the imperative API only. The draft's declarative form API is still marked as a TODO and its execution steps are not specified. [Declarative WebMCP](https://webmachinelearning.github.io/webmcp/#declarative-webmcp)

## Current API contract

The canonical API is `document.modelContext`. It is available only in secure contexts and returns the same `ModelContext` object for that `Document`. Early `navigator.modelContext`, `provideContext()`, `clearContext()` and `unregisterTool()` examples are obsolete. Feature detection should use:

```ts
if (!("modelContext" in document)) return;
```

Do not treat feature detection as permission to call the API successfully. Registration may still reject if the document is inactive, is not origin-keyed, or cannot use the `tools` permissions-policy feature. [Document extension and `ModelContext`](https://webmachinelearning.github.io/webmcp/#api)

Register one tool at a time:

```ts
const controller = new AbortController();

await document.modelContext.registerTool(
  {
    name: "search_policies",
    title: "Search Australian AI policies",
    description: "Search Policai's verified public policy register.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 200 },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    async execute(input, { signal }) {
      // Validate input again, call Policai's public API, and honour signal.
      return { policies: [] };
    },
  },
  { signal: controller.signal },
);

// Remove this registration.
controller.abort();
```

A `ModelContextTool` has `name`, optional `title`, `description`, optional `inputSchema`, `execute` and optional `annotations`. Names must contain 1 to 128 ASCII letters, digits, `_`, `-` or `.`. Duplicate names reject with `InvalidStateError`. There is no replace or update method – abort the old registration before registering the new definition. Each execution receives `(inputObject, { signal })`; the signal reports cancellation. [Tool dictionary](https://webmachinelearning.github.io/webmcp/#model-context-tool) [Registration options](https://webmachinelearning.github.io/webmcp/#model-context-register-tool-options)

The registration signal owns the tool's lifetime. Aborting it unregisters the tool and triggers tool-change notification. It does not cancel a tool call that is already running. The execution signal is separate and should be passed to `fetch`. Registrations belong to the current `Document`, so a client component must register after mount and abort all controllers during cleanup. [Registration and unregistration algorithms](https://webmachinelearning.github.io/webmcp/#model-context-container)

`getTools()` and `executeTool()` are consumer APIs for in-page agents. Policai does not need them to expose tools to a browser agent. A browser agent discovers tools through an implementation-defined observation mechanism. The API does not require MCP as the browser-agent transport. [Interaction with agents](https://webmachinelearning.github.io/webmcp/#interaction-with-agents)

## Schemas and results

`inputSchema` is described as a JSON Schema object and the draft references JSON Schema 2020-12. The current registration algorithm only checks that the value can be JSON-serialized. It does not validate inputs against the schema before invoking `execute`. Policai must therefore validate every callback input at the trust boundary. Keep the schemas narrow with enums, maximum lengths, result limits and `additionalProperties: false`. [Input schema registration algorithm](https://webmachinelearning.github.io/webmcp/#model-context-container)

The standard surface has no `outputSchema`. An `execute` callback may resolve to any JSON-serializable JavaScript value. The browser serializes that value and supplies the resulting JSON string to the caller. A rejected callback or a value that cannot be serialized fails the tool call. Return compact plain objects – not MCP `content` arrays – and bound result sizes. [Imperative execute steps](https://webmachinelearning.github.io/webmcp/#pending-tool-executions)

The draft and Chrome currently differ on manual consumer calls. The draft's `executeTool()` accepts an object. Chrome's current documentation still requires a JSON string. This does not affect a registered tool's `execute` callback, which receives an object. Policai does not need to call `executeTool()`, so any compatibility code should stay in tests rather than the production registration path. [Draft IDL](https://webmachinelearning.github.io/webmcp/#idl-index) [Chrome imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api#execute-tool)

## Browser support

Chromium's approved experiment runs from milestones 149 to 156. The official intent identifies milestone 146 as the developer trial and milestone 157 as the estimated shipping target. Those dates are plans, not a stable-support guarantee. The same notice records no Gecko or WebKit signal and says only the IDL and basic use have web-platform tests. Policai should not add a production polyfill or dependency unless a real consumer requires one. [Chromium Intent to Experiment](https://groups.google.com/a/chromium.org/g/blink-dev/c/gmYffo5WOE8/m/7Rx2_OOfBAAJ)

Chrome's current local-development switch is `chrome://flags/#enable-webmcp-testing`. Test the enhancement in a secure, real-origin browser context with that flag. Keep ordinary unit tests against a small local `document.modelContext` stub. Production code should silently skip registration when feature detection fails. [Chrome WebMCP overview](https://developer.chrome.com/docs/ai/webmcp#get-started)

## Security and user control

The API requires no user activation to register tools. Execution requires an agent, but the specification does not itself guarantee a confirmation prompt or user consent. Tool annotations are hints, not enforced permissions. Policai should therefore:

- set `readOnlyHint: true` on every exposed tool;
- set `untrustedContentHint: true` when results can contain source text, machine summaries or other content that Policai has not authored as instructions;
- describe exactly what each tool reads and avoid ambiguous verbs;
- accept only fields needed for the search;
- validate inputs independently of the schema and cap outputs;
- honour cancellation signals; and
- keep all editorial and mutating functions out of WebMCP.

The draft identifies prompt injection in tool metadata and output, mismatch between a tool's description and behaviour, over-parameterisation, cross-origin leakage and private-browsing leakage as unresolved risks. Its `untrustedContentHint` mitigation only gives the agent a signal for heightened handling. It does not sanitize the result. [Security and privacy considerations](https://webmachinelearning.github.io/webmcp/#security-privacy)

WebMCP is also gated by the `tools` permissions-policy feature, whose default allowlist is `'self'`. Policai should omit `exposedTo` and avoid cross-origin iframe delegation. If this changes later, each delegated origin must be explicit and potentially trustworthy. [Permissions policy integration](https://webmachinelearning.github.io/webmcp/#permissions-policy-integration)
