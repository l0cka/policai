---
type: instrument_note
title: "ASD's open-weight AI guidance: running the model yourself means doing the provider's security job"
summary: On 5 November 2026 ASD's ACSC published two guidance documents on open-weight AI models. They say an organisation that hosts a model itself takes on the safeguards, monitoring, updates and incident response a provider would otherwise run, and should not adopt a model whose provenance or assurance it cannot establish for the intended use.
status: published
publishedAt: 2026-11-10
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

On 5 November 2026 the Australian Signals Directorate's Australian Cyber Security Centre (ASD's ACSC) released two publications on open-weight AI models ([ASD announcement](https://www.cyber.gov.au/news/new-guidance-on-open-weight-ai-models)). [Open-weight AI models: Opportunities and cyber security risks](/policies/asd-open-weight-ai-opportunities-risks-2026) covers whether to adopt such a model, and its companion, [Selecting, deploying and operating open-weight AI models securely](/policies/asd-open-weight-ai-secure-operation-2026), covers what an organisation must do once it runs one ([ASD announcement](https://www.cyber.gov.au/news/new-guidance-on-open-weight-ai-models)).

## What it says

ASD describes open-weight models as AI models whose weights are publicly released, so that organisations can download, modify and operate them on their own infrastructure ([Opportunities and risks](https://www.cyber.gov.au/publication/open-weight-ai-models-opportunities-and-cyber-security-risks)). It distinguishes them from closed models, where the weights stay with the provider, and from open-source models, which also release training data and code and which it says remain rare ([Opportunities and risks](https://www.cyber.gov.au/publication/open-weight-ai-models-opportunities-and-cyber-security-risks)).

The first publication lists benefits for Australian organisations, including local control of sensitive data, reduced dependence on offshore providers, support for sovereign research capability and use in defensive cyber security operations ([Opportunities and risks](https://www.cyber.gov.au/publication/open-weight-ai-models-opportunities-and-cyber-security-risks)). It then sets out four risk areas that arise because released weights can be copied, modified and redistributed without the original developer's oversight ([Opportunities and risks](https://www.cyber.gov.au/publication/open-weight-ai-models-opportunities-and-cyber-security-risks)):

- model selection, provenance and developer jurisdiction;
- the model, data and software supply chain, including model formats that can execute code and hidden behaviours or backdoors;
- fine-tuned models that may memorise and reveal sensitive training data; and
- safeguards that may be weakened or removed, which ASD says is amplified in agentic systems that can call tools or take actions.

Its recommended actions include defining intended and prohibited uses, not adopting a model whose provenance cannot be established to a level appropriate to that use, verifying hashes and signatures, loading new models in a sandbox first, preferring file formats that cannot contain executable code, and placing controls outside the model with human approval for high-risk or irreversible actions ([Opportunities and risks](https://www.cyber.gov.au/publication/open-weight-ai-models-opportunities-and-cyber-security-risks)).

The companion publication says operating an open-weight model "places the organisation in the role a hosting provider would otherwise fill" ([Selecting, deploying and operating](https://www.cyber.gov.au/publication/open-weight-ai-models-selecting-deploying-and-operating-open-weight-ai-models-securely)). It asks for an organisational policy on approved use cases, a formal onboarding assessment, a register of approved models recording the use case, accountable owner, risk acceptance decision and next review date, and a technical inventory of deployed versions, adapters, dependencies and configurations ([Selecting, deploying and operating](https://www.cyber.gov.au/publication/open-weight-ai-models-selecting-deploying-and-operating-open-weight-ai-models-securely)).

It sets five principles for choosing and running a model: choose proportionately, know and verify the source, verify suitability, assess and secure the deployment, and maintain assurance ([Selecting, deploying and operating](https://www.cyber.gov.au/publication/open-weight-ai-models-selecting-deploying-and-operating-open-weight-ai-models-securely)). On the source, it says country of origin should be considered as one element of the assessment and not, by itself, as evidence that a model is trustworthy or untrustworthy ([Selecting, deploying and operating](https://www.cyber.gov.au/publication/open-weight-ai-models-selecting-deploying-and-operating-open-weight-ai-models-securely)). Each principle ends with the same consequence: where the requirement cannot be met for the intended use, the model should not be adopted or the deployment should be reconsidered ([Selecting, deploying and operating](https://www.cyber.gov.au/publication/open-weight-ai-models-selecting-deploying-and-operating-open-weight-ai-models-securely)).

It then covers the deployment risks the operator carries: infrastructure security, model maintenance and updates, and monitoring, evaluation and incident response, including logging prompts, responses and tool activity commensurate with risk and keeping tested procedures for rollback, credential revocation and incident reporting ([Selecting, deploying and operating](https://www.cyber.gov.au/publication/open-weight-ai-models-selecting-deploying-and-operating-open-weight-ai-models-securely)). Where a provider hosts an open-weight model, including through an API, ASD says the organisation is consuming a hosted AI service and should apply cloud security risk management practices instead ([Selecting, deploying and operating](https://www.cyber.gov.au/publication/open-weight-ai-models-selecting-deploying-and-operating-open-weight-ai-models-securely)).

## Who it affects

Both publications are written for executives, technology leaders and cyber security practitioners: the first for those considering whether to adopt open-weight models, the second for those responsible for selecting, governing, deploying and securing them ([Opportunities and risks](https://www.cyber.gov.au/publication/open-weight-ai-models-opportunities-and-cyber-security-risks); [Selecting, deploying and operating](https://www.cyber.gov.au/publication/open-weight-ai-models-selecting-deploying-and-operating-open-weight-ai-models-securely)). The register classes both as guidelines ([record](/policies/asd-open-weight-ai-opportunities-risks-2026); [record](/policies/asd-open-weight-ai-secure-operation-2026)).

For agentic deployments, the first publication points readers to ASD's [Careful adoption of agentic AI services](/policies/asd-careful-adoption-agentic-ai-services-2026) and [Agentic AI harnesses](/policies/asd-agentic-ai-harnesses-2026) ([Opportunities and risks](https://www.cyber.gov.au/publication/open-weight-ai-models-opportunities-and-cyber-security-risks)). Policai's [note on the harnesses guidance](/analysis/asd-agentic-ai-harnesses-guidance) covers where ASD places those controls.

## Analysis

In Policai's analysis, the guidance does not tell organisations to avoid open-weight models. It reframes the choice as one about capability: an organisation that self-hosts must be able to run the safeguard, monitoring, patching and incident response work a provider would otherwise do, and if it cannot, ASD's own principles say not to adopt. The line it draws between self-hosting and consuming an open-weight model through a hosted API matters in practice, because the second is treated like any other cloud service.
