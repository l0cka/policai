import { defineAgent } from "@grok/agent-sdk";

export default defineAgent({
  tools: ["read", "grep"],
  local: {
    sandbox: true,
  },
});
