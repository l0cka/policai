---
type: instrument_note
title: "ASD's agentic AI guidance puts the controls in the harness, not the model"
summary: ASD's September 2026 publication says organisations can govern the agentic AI harness, and should enforce least privilege, human approval and logging there, because prompt injection cannot be reliably fixed in the model.
status: published
publishedAt: 2026-10-17
cites:
  - asd-agentic-ai-harnesses-2026
  - asd-careful-adoption-agentic-ai-services-2026
sources:
  - https://www.cyber.gov.au/advisory/agentic-ai-harnesses
image:
  src: "/images/articles/asd-agentic-ai-harnesses-guidance/lead.jpg"
  alt: "A coiled green ethernet patch cable with its clear plastic connector, photographed on a white background."
  width: 2048
  height: 1638
  title: "EthernetCableGreen2"
  creator: "Raysonho @ Open Grid Scheduler / Grid Engine"
  creatorUrl: "https://commons.wikimedia.org/wiki/User:Raysonho"
  sourceUrl: "https://commons.wikimedia.org/wiki/File:EthernetCableGreen2.jpg"
  licence: "CC0-1.0"
  licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/"
  modifications: "resized"
  licenceCheckedAt: "2026-10-17"
---

The Australian Signals Directorate (ASD) has published [Agentic AI harnesses](/policies/asd-agentic-ai-harnesses-2026), guidance for executives, chief information security officers and IT leaders. It says "organisations control the harness, not the LLM", so the harness is where security and governance controls belong ([ASD advisory](https://www.cyber.gov.au/advisory/agentic-ai-harnesses)). The register records publication on 11 September 2026.

## What it says

The advisory defines the harness as "the software layer that connects the LLM to external tools, data sources, memory and planning workflows". It also "enforces the system's action and execution privileges". It says prompt injection is inherent to how models process context, and that "no fully reliable technical mitigation currently exists". Mitigations must therefore sit in the harness, by controlling what an agent can access and do.

```figure
kind: matrix
title: Many of the controls ASD describes are set in the harness, not the model
alt: "Comparison of an LLM and a harness. The LLM only produces text and can be swapped; the harness keeps state, runs tools, enforces permissions and approvals, and outlasts any single model."
caption: ASD's summary of the differences between an LLM and a harness, abridged, from the advisory.
cites: [asd-agentic-ai-harnesses-2026]
sources:
  - https://www.cyber.gov.au/advisory/agentic-ai-harnesses
columns: [Dimension, LLM, Harness]
rows:
  - [Core job, Predicts the next words or text, Decides what text goes in front of the model and what to do with the output]
  - [State, Stateless, "Stateful: persists context, files, memory and progress"]
  - [Actions, Produces tokens only, "Executes tools, edits files, runs commands, calls APIs"]
  - [Control, Does not directly control any resulting actions, "Permissions, sandboxes, approval gates, hooks, policies"]
  - [Failure mode, Hallucination or a wrong answer, "Wrong text, lost memory, unsafe action, context overflow"]
  - [Changeability, "A pluggable part you can swap", "The durable architecture that outlives any single model"]
```

The good-practice list asks organisations to:

- run the harness in an organisation-controlled, hardened environment with only the tools and permissions a task needs;
- require human approval for sensitive or high-impact actions;
- verify outputs before operational use, because "accountability for the result remains with a person";
- record prompts, responses, tool invocations, approvals and configuration changes; and
- start with low-risk use cases and expand "only as controls mature".

## Who it affects

Any organisation adopting or considering agentic AI. The advisory is written for executives, CISOs and IT leaders. It complements ASD's [Careful adoption of agentic AI services](/policies/asd-careful-adoption-agentic-ai-services-2026), which it says sets out five groups of agentic security risk.

## Analysis

In Policai's analysis, the advisory moves the governance question from which model an organisation uses to what the agent can reach and who approves it. A buyer of a commercial agent product can ask the supplier the advisory's own questions: what data and tools the agent can access, which actions need human approval, and whether significant actions can be monitored and audited. The advisory is guidance, not a legal requirement.
