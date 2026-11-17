---
type: instrument_note
title: "ASD's ACSC on using AI for cyber defence, and the limits it sets"
summary: Guidance from ASD's Australian Cyber Security Centre, co-sealed by the Canadian, New Zealand and UK cyber security centres, maps where AI can help defenders across the six Information Security Manual functions. It pairs that with adoption principles that keep humans accountable, limit autonomous actions to narrow, pre-approved and reversible steps, and treat AI tools as part of the attack surface.
status: published
publishedAt: 2026-11-18
cites:
  - acsc-opportunities-ai-cyber-defence-2026
  - asd-careful-adoption-agentic-ai-services-2026
  - new-ai-frontier-cyber-threat-guidance-for-boards-of-director
sources:
  - https://www.cyber.gov.au/news/using-ai-to-strengthen-cyber-defence
  - https://www.cyber.gov.au/publication/opportunities-for-ai-in-cyber-defence
image:
  src: "/images/articles/acsc-opportunities-ai-cyber-defence-2026/lead.jpg"
  alt: "Technicians work at a curved bank of desks with computer monitors and laptops in a network operations centre, with glass-walled offices behind them."
  width: 2048
  height: 1536
  title: "NOC-Architel"
  creator: "Mike Reyher"
  sourceUrl: "https://commons.wikimedia.org/wiki/File:NOC-Architel.jpg"
  licence: "CC-BY-2.0"
  licenceUrl: "https://creativecommons.org/licenses/by/2.0/"
  modifications: "resized"
  licenceCheckedAt: "2026-11-18"
---

The Australian Signals Directorate's Australian Cyber Security Centre (ASD's ACSC) announced [Opportunities for AI in cyber defence](/policies/acsc-opportunities-ai-cyber-defence-2026) on 2 September 2026, to help organisations "understand how and where to use AI securely in cyber defence operations" ([ASD news](https://www.cyber.gov.au/news/using-ai-to-strengthen-cyber-defence)). The publication page is dated 8 September 2026 and its downloadable PDF is dated August 2026 ([ASD publication](https://www.cyber.gov.au/publication/opportunities-for-ai-in-cyber-defence)), so the register holds the date to the month ([record](/policies/acsc-opportunities-ai-cyber-defence-2026)). It was co-sealed by the Canadian Centre for Cyber Security, New Zealand's National Cyber Security Centre and the United Kingdom's National Cyber Security Centre ([ASD publication](https://www.cyber.gov.au/publication/opportunities-for-ai-in-cyber-defence)).

## What it says

The guidance starts from the threat side. It says malicious actors are embedding AI models in their workflows to automate reconnaissance, develop attack tooling and analyse compromised data, which "shortens the time between vulnerability discovery and exploitation", and that AI lowers the skill needed for activities such as producing evasive malware ([ASD publication](https://www.cyber.gov.au/publication/opportunities-for-ai-in-cyber-defence)). Its answer is that defenders should use AI too, but that AI "should support – not replace – basic security practices" such as patching, reducing the attack surface and layered defence ([ASD publication](https://www.cyber.gov.au/publication/opportunities-for-ai-in-cyber-defence)).

It then maps AI uses to the six functions of the Information Security Manual (ISM): Govern, Identify, Protect, Detect, Respond and Recover ([ASD publication](https://www.cyber.gov.au/publication/opportunities-for-ai-in-cyber-defence)). Examples include ([ASD publication](https://www.cyber.gov.au/publication/opportunities-for-ai-in-cyber-defence)):

- **Identify:** prioritising patching using severity, exploit availability, threat intelligence and operational impact, and linking several lower-severity vulnerabilities into attack paths;
- **Protect:** scanning source code and infrastructure as code for flaws that pattern-based scanners miss, and extending zero-trust architecture to AI agents as well as human users;
- **Detect:** triaging alerts across identity, endpoint, network and cloud telemetry, and detecting AI misuse through AI-specific telemetry such as model inputs and decision traces;
- **Respond:** correlating alerts and forensic artefacts into an account of an incident, and preparing or initiating "pre-approved and reversible" response actions, with human approval required for high-impact containment, disruption, recovery or communication decisions; and
- **Recover:** rolling AI models back to earlier versions where compromise, poisoning or drift is suspected.

The second half sets out principles for adopting AI securely. Under human oversight, organisations should "limit autonomous actions to those that are narrowly scoped, preapproved and reversible", require human review for actions with significant security, operational or safety impact, and include AI failures, compromise and hallucinations in incident response plans ([ASD publication](https://www.cyber.gov.au/publication/opportunities-for-ai-in-cyber-defence)). Other principles cover sandboxing AI tools with minimal privileges, integrating them through approved and auditable architectures, keeping sensitive information out of unapproved or consumer AI services, and maintaining an AI bill of materials or equivalent for AI supply chain components ([ASD publication](https://www.cyber.gov.au/publication/opportunities-for-ai-in-cyber-defence)). It says vendor claims, demonstrations and limited testing "are not enough", and asks organisations to test AI tools in their own environment before production use ([ASD publication](https://www.cyber.gov.au/publication/opportunities-for-ai-in-cyber-defence)).

Two appendices list questions to put to AI vendors, covering measurable security outcomes, human oversight, auditability, protection against prompt injection and poisoning, where customer data is processed or stored, and lock-in and dependency risk ([ASD publication](https://www.cyber.gov.au/publication/opportunities-for-ai-in-cyber-defence)).

## Who it affects

The guidance is written for chief information security officers, senior security leaders and cyber defenders responsible for cyber security strategy, operations and risk outcomes ([ASD publication](https://www.cyber.gov.au/publication/opportunities-for-ai-in-cyber-defence)). It asks critical infrastructure to place "particular focus" on resilient, continuously assured controls, given its heightened risk and impact ([ASD publication](https://www.cyber.gov.au/publication/opportunities-for-ai-in-cyber-defence)).

For agentic systems it points readers to ASD's [Careful adoption of agentic AI services](/policies/asd-careful-adoption-agentic-ai-services-2026) ([ASD publication](https://www.cyber.gov.au/publication/opportunities-for-ai-in-cyber-defence)), joint guidance for organisations designing, deploying or operating agentic AI systems ([record](/policies/asd-careful-adoption-agentic-ai-services-2026)).

## Analysis

In Policai's analysis, most of ASD's recent AI publications on the register treat AI as a risk to be contained. This one is the register's clearest statement from ASD that defenders are expected to use AI as well, and it ties that use to the existing ISM structure rather than creating a separate AI framework.

In Policai's analysis, the operative line is the limit on autonomy. "Narrowly scoped, preapproved and reversible" gives security teams a test they can apply to any AI-driven response action, and the guidance repeats the same human-approval boundary in its Respond and Recover functions. That is a narrower position than vendor marketing about autonomous security operations.

In Policai's analysis, the guidance is the practitioner counterpart to ASD and the AICD's [Frontier AI cyber threat considerations for boards of directors](/policies/new-ai-frontier-cyber-threat-guidance-for-boards-of-director) ([record](/policies/new-ai-frontier-cyber-threat-guidance-for-boards-of-director)). Both rest on the same premise, that AI is compressing the time between discovery and exploitation. The board guidance asks directors to test their risk tolerance against that premise. This publication tells the security team what to build in response, and the vendor questions in its appendices are the part most likely to be used directly in procurement.
