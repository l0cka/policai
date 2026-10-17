---
type: instrument_note
title: "Queensland agencies must assess AI with a FAIRA, with a shorter version for trials"
summary: Version 2.0.0 of Queensland's mandated AI governance policy, effective August 2026, requires agencies to follow ISO 38507 and to prepare a Foundational AI Risk Assessment, or an agreed equivalent, when evaluating AI.
status: published
publishedAt: 2026-10-17
cites:
  - queensland-ai-governance-policy
  - queensland-foundational-ai-risk-assessment-guideline
sources:
  - https://www.forgov.qld.gov.au/information-technology/queensland-government-enterprise-architecture-qgea/qgea-directions-and-guidance/qgea-policies-standards-and-guidelines/artificial-intelligence-governance-policy
  - https://www.forgov.qld.gov.au/information-technology/queensland-government-enterprise-architecture-qgea/qgea-directions-and-guidance/qgea-policies-standards-and-guidelines/foundational-artificial-intelligence-risk-assessment-guideline
image:
  src: "/images/articles/queensland-ai-governance-policy-v2/lead.jpg"
  alt: "The Brisbane skyline at night, with lit office towers and a river bridge reflected in the water of the Brisbane River."
  width: 2048
  height: 1536
  title: "AUS Brisbane, Central Business District, Brisbane River 003"
  creator: "-wuppertaler"
  creatorUrl: "https://commons.wikimedia.org/wiki/User:-wuppertaler"
  sourceUrl: "https://commons.wikimedia.org/wiki/File:AUS_Brisbane,_Central_Business_District,_Brisbane_River_003.jpg"
  licence: "CC-BY-4.0"
  licenceUrl: "https://creativecommons.org/licenses/by/4.0/"
  modifications: "resized"
  licenceCheckedAt: "2026-10-17"
---

Queensland's [Artificial intelligence governance policy](/policies/queensland-ai-governance-policy) is mandated and at version 2.0.0, effective from August 2026. When evaluating AI solutions, agencies "must prepare a Foundational AI risk assessment (FAIRA), or an agreed equivalent" ([policy page](https://www.forgov.qld.gov.au/information-technology/queensland-government-enterprise-architecture-qgea/qgea-directions-and-guidance/qgea-policies-standards-and-guidelines/artificial-intelligence-governance-policy)).

## What it requires

The policy has two requirements. Agencies "must establish AI governance arrangements with regard to the current version of ISO 38507", and they must align with Australia's AI Ethics Principles by preparing a FAIRA across the AI lifecycle. An agency "can prepare a FAIRA LITE" for low-risk use cases, "including proofs of concept, trials, or exploratory activities".

```figure
kind: flow
title: A low-risk trial can use FAIRA LITE; every other AI solution needs a FAIRA
alt: "Flow: an agency evaluating an AI solution asks whether it is a low-risk proof of concept, trial or exploratory activity. If not, it prepares a FAIRA or an agreed equivalent. If so, it may prepare a FAIRA LITE in line with the guideline."
caption: The assessment path in the policy's second requirement, as published in August 2026.
cites: [queensland-ai-governance-policy, queensland-foundational-ai-risk-assessment-guideline]
sources:
  - https://www.forgov.qld.gov.au/information-technology/queensland-government-enterprise-architecture-qgea/qgea-directions-and-guidance/qgea-policies-standards-and-guidelines/artificial-intelligence-governance-policy
steps:
  - text: An agency evaluates an AI solution
  - text: Is it a low-risk proof of concept, trial or exploratory activity?
    role: decision
  - text: Prepare a FAIRA, or an agreed equivalent
    role: end
    label: No
branch:
  from: 2
  label: Yes
  steps:
    - text: May prepare a FAIRA LITE in line with the guideline
      role: end
```

## What it covers

The policy applies to Queensland Government departments. It also applies to accountable officers and statutory bodies "in the context of internal controls, financial information management systems and risk management", and to all services delivered by agencies.

It says a FAIRA "is likely to contribute to other assessments but does not replace them", such as privacy impact assessments, information security threat and risk assessments, penetration testing and human rights impact assessments.

## The guideline

The [FAIRA guideline](/policies/queensland-foundational-ai-risk-assessment-guideline) explains when and how to prepare a FAIRA or FAIRA LITE. It is also at version 2.0.0, effective from August 2026, and the register records its first effective date as September 2024. The guideline is non-mandated, but it says "the FAIRA framework is a mandated requirement" under the policy ([guideline page](https://www.forgov.qld.gov.au/information-technology/queensland-government-enterprise-architecture-qgea/qgea-directions-and-guidance/qgea-policies-standards-and-guidelines/foundational-artificial-intelligence-risk-assessment-guideline)).

## Analysis

In Policai's analysis, the policy sets the duty and the guideline sets the method: the duty is mandated, and the guidance on how to meet it is not. The policy does not say who agrees an "equivalent" or what counts as one, so an agency using another assessment has to confirm that with whoever is responsible within its own governance arrangements.
