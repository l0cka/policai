---
type: instrument_note
title: "ASD's agentic AI guidance puts the controls in the harness, not the model"
summary: ASD's September 2026 publication treats the agentic AI harness, not the model, as the part an organisation can most directly govern, and says controls such as least privilege, human approval and logging belong there.
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

The Australian Signals Directorate (ASD) has published [Agentic AI harnesses](/policies/asd-agentic-ai-harnesses-2026), guidance for executive decision-makers, chief information security officers and IT leaders. It treats the harness, not the model, as the part of an agentic AI system an organisation can most directly govern and secure. The register records publication on 11 September 2026 ([ASD advisory](https://www.cyber.gov.au/advisory/agentic-ai-harnesses)).

## What it says

The harness is the software around the model. The register records that the advisory describes its components as the user interface, the prompt and policy layer, the context manager, the model interface, the tool registry, the permission system, the execution environment, the connector layer, the memory and session store, audit and observability, and the update and supply-chain path ([record](/policies/asd-agentic-ai-harnesses-2026)).

It explains that prompt injection cannot be reliably fixed in the model, so controls have to be enforced in the harness. The recommended controls are:

- least-privilege access and a hardened, organisation-controlled execution environment;
- human approval for sensitive or high-impact actions;
- validation of tool parameters, outputs and agent work before operational use;
- logging of prompts, responses, tool invocations, approvals and configuration changes;
- cost monitoring to detect misuse or runaway agents;
- careful model selection, focused context and bounded sub-agents; and
- a persistent organisational rules file.

It closes with governance questions for executives and advises a phased adoption that starts with low-risk use cases ([record](/policies/asd-agentic-ai-harnesses-2026)).

## Who it affects

Any organisation adopting or considering agentic AI, with executives, security leaders and IT leaders as the audience. The register records that it complements ASD's [Careful adoption of agentic AI services](/policies/asd-careful-adoption-agentic-ai-services-2026), published on 1 May 2026 with international partners. That guidance advises introducing agentic systems incrementally, starting with low-risk tasks, and enforcing least privilege, strong identity management and continuous monitoring ([record](/policies/asd-careful-adoption-agentic-ai-services-2026)).

## Analysis

In Policai's analysis, the advisory moves the governance question from which model an organisation uses to what the agent can reach and who approves it. A buyer of a commercial agent product can ask the supplier where each control on the list above is enforced. The register classes the advisory as a guideline, so it sets expectations, not legal requirements.
