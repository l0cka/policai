---
type: instrument_note
title: "ASD's open-weight AI guidance: self-hosting means taking on the provider's security role"
summary: On 5 November 2026 the Australian Signals Directorate's Australian Cyber Security Centre published two guidance documents on open-weight AI models. They say an organisation that hosts a model itself takes on the safeguards, monitoring, updates and incident response a provider would otherwise run, and should not adopt a model whose provenance or assurance it cannot establish for the intended use.
status: published
publishedAt: 2026-11-10
updatedAt: 2026-11-12
corrections:
  - date: 2026-11-12
    text: "The note said the companion publication covers what an organisation must do; it is non-binding guidance on what ASD recommends. It now gives ASD's full wording on provenance, documentation or assurance information that cannot be established, and was shortened to the 550-word limit for instrument notes."
cites:
  - asd-open-weight-ai-opportunities-risks-2026
  - asd-open-weight-ai-secure-operation-2026
  - asd-agentic-ai-harnesses-2026
  - asd-careful-adoption-agentic-ai-services-2026
sources:
  - https://www.cyber.gov.au/news/new-guidance-on-open-weight-ai-models
  - https://www.cyber.gov.au/publication/open-weight-ai-models-opportunities-and-cyber-security-risks
  - https://www.cyber.gov.au/publication/open-weight-ai-models-selecting-deploying-and-operating-open-weight-ai-models-securely
image:
  src: "/images/articles/asd-open-weight-ai-models-guidance-2026/lead.jpg"
  alt: "Rows of black open-frame server racks with blue and white network cabling in an empty data centre room with a raised, perforated tile floor."
  width: 2048
  height: 1365
  title: "Datacenter Server Racks (22370909788)"
  creator: "Carl Lender"
  creatorUrl: "https://www.flickr.com/people/43547797@N00"
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Datacenter_Server_Racks_(22370909788).jpg"
  licence: "CC-BY-2.0"
  licenceUrl: "https://creativecommons.org/licenses/by/2.0/"
  modifications: "resized"
  licenceCheckedAt: "2026-11-10"
---

On 5 November 2026 the Australian Signals Directorate's Australian Cyber Security Centre (ASD's ACSC) released two publications on open-weight AI models. [Open-weight AI models: Opportunities and cyber security risks](/policies/asd-open-weight-ai-opportunities-risks-2026) covers whether to adopt such a model; its companion, [Selecting, deploying and operating open-weight AI models securely](/policies/asd-open-weight-ai-secure-operation-2026), covers how ASD recommends an organisation govern, deploy and operate one ([ASD announcement](https://www.cyber.gov.au/news/new-guidance-on-open-weight-ai-models)).

## What it says

ASD describes open-weight models as models whose weights are publicly released, so organisations can download, modify and run them on their own infrastructure. Open-source models also release training data and code; ASD says they remain rare ([Opportunities and risks](https://www.cyber.gov.au/publication/open-weight-ai-models-opportunities-and-cyber-security-risks)).

The first publication lists benefits including local control of sensitive data, reduced dependence on offshore providers, sovereign research capability and defensive cyber security operations. It sets out four risk areas that arise because released weights can be copied and modified without the original developer's oversight ([Opportunities and risks](https://www.cyber.gov.au/publication/open-weight-ai-models-opportunities-and-cyber-security-risks)):

- model selection, provenance and developer jurisdiction;
- the model, data and software supply chain, including model formats that can execute code and hidden behaviours or backdoors;
- fine-tuned models that may memorise and reveal sensitive training data; and
- safeguards that may be weakened or removed, which ASD says is amplified in agentic systems.

Its recommended actions include not adopting a model whose provenance, documentation or assurance information cannot be established to a level appropriate to that use, and requiring human approval for high-risk or irreversible actions ([Opportunities and risks](https://www.cyber.gov.au/publication/open-weight-ai-models-opportunities-and-cyber-security-risks)).

The companion says operating an open-weight model "places the organisation in the role a hosting provider would otherwise fill". It asks for a policy on approved use cases, a formal onboarding assessment, and a register of approved models with an accountable owner and review date for each ([Selecting, deploying and operating](https://www.cyber.gov.au/publication/open-weight-ai-models-selecting-deploying-and-operating-open-weight-ai-models-securely)).

It sets five principles: choose proportionately, know and verify the source, verify suitability, assess and secure the deployment, and maintain assurance. Country of origin is one element of the source assessment and not, by itself, evidence that a model is trustworthy or untrustworthy. Each ends the same way: where its requirement cannot be met, the model should not be adopted or the deployment reconsidered ([Selecting, deploying and operating](https://www.cyber.gov.au/publication/open-weight-ai-models-selecting-deploying-and-operating-open-weight-ai-models-securely)).

It then covers the operator's risks: infrastructure security, model maintenance and updates, and monitoring and incident response. Where a provider hosts the model, including through an API, ASD says the organisation is consuming a hosted AI service and should apply cloud security risk management practices ([Selecting, deploying and operating](https://www.cyber.gov.au/publication/open-weight-ai-models-selecting-deploying-and-operating-open-weight-ai-models-securely)).

## Who it affects

Both publications are written for executives, technology leaders and cyber security practitioners ([Opportunities and risks](https://www.cyber.gov.au/publication/open-weight-ai-models-opportunities-and-cyber-security-risks); [Selecting, deploying and operating](https://www.cyber.gov.au/publication/open-weight-ai-models-selecting-deploying-and-operating-open-weight-ai-models-securely)). The register lists [the first](/policies/asd-open-weight-ai-opportunities-risks-2026) and [the second](/policies/asd-open-weight-ai-secure-operation-2026) as guidelines.

For agentic systems, the first points readers to ASD's [Careful adoption of agentic AI services](/policies/asd-careful-adoption-agentic-ai-services-2026) and [Agentic AI harnesses](/policies/asd-agentic-ai-harnesses-2026) ([Opportunities and risks](https://www.cyber.gov.au/publication/open-weight-ai-models-opportunities-and-cyber-security-risks)). Policai's [note on the harnesses guidance](/analysis/asd-agentic-ai-harnesses-guidance) covers where ASD places those controls.

## Analysis

In Policai's analysis, the guidance does not tell organisations to avoid open-weight models. It reframes the choice as one about capability: an organisation that self-hosts must be able to run the safeguard, monitoring, patching and incident response work a provider would otherwise do, and if it cannot, ASD's own principles say not to adopt. The line it draws between self-hosting and using a hosted API matters, because ASD treats the second like any other cloud service.
