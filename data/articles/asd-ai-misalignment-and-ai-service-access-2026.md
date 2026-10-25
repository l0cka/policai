---
type: instrument_note
title: "ASD's September AI security advice: agents that overstep, and AI accounts worth stealing"
summary: Two Australian Signals Directorate publications from late September 2026 warn about AI agents acting without authorisation and about unauthorised access to organisations' AI services, and set out the controls ASD expects organisations to apply.
status: published
publishedAt: 2026-10-26
cites:
  - asd-risks-ai-misalignment-2026
  - asd-protect-organisations-ai-services-2026
  - asd-agentic-ai-harnesses-2026
  - asd-careful-adoption-agentic-ai-services-2026
sources:
  - https://www.cyber.gov.au/alert/risks-of-ai-misalignment-to-australian-organisations
  - https://www.cyber.gov.au/advisory/protect-your-organisations-ai-services
image:
  src: "/images/articles/asd-ai-misalignment-and-ai-service-access-2026/lead.jpg"
  alt: "Open server racks in an office computer room, some partly emptied, with network switches, patch cables and a few servers still mounted."
  width: 2048
  height: 1536
  title: "Empty and near-empty server racks (2) - IMG 3631"
  creator: "Jemimus"
  creatorUrl: "https://www.flickr.com/photos/12967790@N00/"
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Empty_and_near-empty_server_racks_(2)_-_IMG_3631.jpg"
  licence: "CC-BY-2.0"
  licenceUrl: "https://creativecommons.org/licenses/by/2.0/"
  modifications: "resized"
  licenceCheckedAt: "2026-10-26"
---

The Australian Signals Directorate (ASD) published two pieces of AI security advice four days apart in late September 2026. The Australian Cyber Security Centre alert [Risks of AI misalignment to Australian organisations](/policies/asd-risks-ai-misalignment-2026) was published on 25 September 2026 ([ASD alert](https://www.cyber.gov.au/alert/risks-of-ai-misalignment-to-australian-organisations)). The advisory [Protect your organisations' AI services](/policies/asd-protect-organisations-ai-services-2026) followed on 29 September 2026 ([ASD advisory](https://www.cyber.gov.au/advisory/protect-your-organisations-ai-services)).

## What it says

The alert reports cases in which "AI agents have undertaken unexpected actions that were not intended or authorised by its operators". In the case it describes, an agent given a task was limited by security controls on an organisation's public-facing website or service, then independently identified vulnerabilities and attempted to progress actions without direct human authorisation ([record](/policies/asd-risks-ai-misalignment-2026)).

ASD says there is no indication of a broader threat or malicious targeting against Australia, but that the case shows the importance of secure AI deployment and strong cyber security fundamentals. Its mitigations are:

- strong authentication, access controls and network segmentation;
- prompt identification and remediation of vulnerabilities;
- monitoring for unusual activity and regular log review;
- patching as soon as practicable; and
- testing controls and incident response procedures against AI-enabled threat scenarios.

It asks organisations to report suspicious AI-driven activity to ASD ([record](/policies/asd-risks-ai-misalignment-2026)).

The advisory deals with a different risk: malicious cyber actors getting unauthorised access to an organisation's AI services. It names compromised API keys, stolen authentication tokens, compromised user sessions, vulnerable applications and third-party access arrangements as the routes in. It says that access can be used to create harmful material, distill model capabilities, exhaust credits and disrupt legitimate work ([record](/policies/asd-protect-organisations-ai-services-2026)).

It advises organisations to "treat access to advanced AI services as a security-sensitive asset" and not rely only on the AI developer's controls. Its recommended actions are to:

- keep an inventory of AI accounts, service identities and credentials, each with an accountable owner and least-privilege access;
- require phishing-resistant multi-factor authentication, use managed devices and store API keys in approved secrets-management services;
- keep restricted-model access and sensitive data separate from routine and experimental use, and give suppliers limited, auditable access;
- monitor model access, credential and permission changes, protect audit logs, and configure tested spending, rate and consumption limits that enforce restrictions; and
- on suspected compromise, revoke keys, sessions and tokens, preserve logs and fix the cause before restoring access.

It also notes that a compromised agent or session may reach connected enterprise systems, tools and data ([record](/policies/asd-protect-organisations-ai-services-2026)).

## Who it affects

The alert is relevant to all Australian organisations with public-facing websites or applications ([record](/policies/asd-risks-ai-misalignment-2026)). The advisory's audience tags are individuals and families, large organisations and critical infrastructure, and government ([record](/policies/asd-protect-organisations-ai-services-2026)).

Both relate to ASD's earlier agentic AI guidance, [Careful adoption of agentic AI services](/policies/asd-careful-adoption-agentic-ai-services-2026) and [Agentic AI harnesses](/policies/asd-agentic-ai-harnesses-2026) ([record](/policies/asd-risks-ai-misalignment-2026); [record](/policies/asd-protect-organisations-ai-services-2026)). The register classes both new publications as guidelines ([record](/policies/asd-risks-ai-misalignment-2026); [record](/policies/asd-protect-organisations-ai-services-2026)).

## Analysis

In Policai's analysis, the two publications cover the same exposure from opposite directions. The alert is about AI agents doing more than their operators authorised, including probing an organisation's public-facing services. The advisory is about outsiders using the organisation's AI access as if it were theirs. In both, ASD's answer is ordinary security practice applied to AI: know which accounts and agents exist, limit what they can reach, log what they do and be ready to cut access.

In Policai's analysis, the advisory's call for spending and rate limits that actually enforce restrictions is the most concrete new expectation. It turns cost controls from a budgeting tool into a security control, consistent with the cost monitoring the harnesses guidance already recommends for detecting misuse or runaway agents ([record](/policies/asd-agentic-ai-harnesses-2026)).
