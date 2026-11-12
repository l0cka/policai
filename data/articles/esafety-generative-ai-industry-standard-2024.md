---
type: instrument_note
title: "The eSafety standard that already binds high impact generative AI services: what it requires, and what the duty of care bill would change"
summary: Since 22 December 2024 an eSafety industry standard has required high impact generative AI services, those capable of producing the most extreme material without controls that make that risk immaterial, to prevent outputs containing child sexual exploitation or pro-terror material, test and adjust their models, differentiate AI outputs and detect abuse material in training data, prompts and outputs. It also sets rules for platforms that host uploaded models. The Digital Duty of Care Bill 2026 would replace this framework; the bill is not law.
status: published
publishedAt: 2026-11-12
updatedAt: 2026-11-12
corrections:
  - date: 2026-11-12
    text: "The title and summary said the standard binds generative AI services; it binds only high impact generative AI services, and excludes a service whose controls make the risk immaterial. The piece now also cites commencement to section 2, states the full section 20(3) exceptions, ties the section 22(3)(f) information or links to generated material, and notes that section 36(9)(b) applies where relevant."
cites:
  - federal-online-safety-designated-internet-services-industry-standard-2024
  - federal-online-safety-relevant-electronic-services-industry-standard-2024
  - esafety-genai-industry-codes
  - federal-online-safety-amendment-digital-duty-of-care-bill-2026
sources:
  - https://www.legislation.gov.au/F2024L00710/asmade/2024-06-21/text/original/epub/OEBPS/document_1/document_1.html
  - https://www.legislation.gov.au/F2024L00710/asmade/details
  - https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Search_Results/Result?bId=r7553
image:
  src: "/images/articles/esafety-generative-ai-industry-standard-2024/lead.jpg"
  alt: "Overhead view of two hands typing on a silver laptop on a dark wooden table, with a smartphone, a wallet and a camera lens beside it."
  width: 2048
  height: 1365
  title: "Hands on a laptop keyboard (Unsplash)"
  creator: "Fabian Irsara"
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Hands_on_a_laptop_keyboard_(Unsplash).jpg"
  licence: "CC0-1.0"
  licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/"
  modifications: "resized"
  licenceCheckedAt: "2026-11-12"
---

The [Online Safety (Designated Internet Services—Class 1A and Class 1B Material) Industry Standard 2024](/policies/federal-online-safety-designated-internet-services-industry-standard-2024) was determined by the eSafety Commissioner, Julie Inman Grant, on 19 June 2024 ([standard as made](https://www.legislation.gov.au/F2024L00710/asmade/2024-06-21/text/original/epub/OEBPS/document_1/document_1.html)). It was registered on the Federal Register of Legislation on 21 June 2024 ([Federal Register details](https://www.legislation.gov.au/F2024L00710/asmade/details)) and commenced on 22 December 2024 under section 2 ([standard, s 2](https://www.legislation.gov.au/F2024L00710/asmade/2024-06-21/text/original/epub/OEBPS/document_1/document_1.html); [record](/policies/federal-online-safety-designated-internet-services-industry-standard-2024)). It sets specific obligations for high impact generative AI services and model distribution platforms ([record](/policies/federal-online-safety-designated-internet-services-industry-standard-2024)), and it sits within the framework the [Online Safety Amendment (Digital Duty of Care) Bill 2026](/policies/federal-online-safety-amendment-digital-duty-of-care-bill-2026) would replace ([APH bill page](https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Search_Results/Result?bId=r7553)).

## What it says

The standard creates a category called a "high impact generative AI DIS": a designated internet service that "uses machine learning models to enable an end-user to produce material" and "is capable of being used to generate synthetic high impact material" ([standard, s 6](https://www.legislation.gov.au/F2024L00710/asmade/2024-06-21/text/original/epub/OEBPS/document_1/document_1.html)). For these services, high impact material means material that would likely be classified X18+ or RC, or Category 2 Restricted or RC for publications (s 6). A service falls outside the category if it "incorporates controls such that the risk of the service being used to generate synthetic high impact material is immaterial" (s 6). The note to the definition gives deepfake child sexual exploitation material as an example of what such services can produce (s 6, note 1).

Section 22(3) sets the minimum the provider of such a service must do ([standard, s 22(3)](https://www.legislation.gov.au/F2024L00710/asmade/2024-06-21/text/original/epub/OEBPS/document_1/document_1.html)):

- implement systems, processes and technologies that prevent generative AI features from being used to generate outputs containing child sexual exploitation material or pro-terror material;
- regularly review and test models for the risk of that use, and promptly adjust models and deploy mitigations after review or testing;
- implement systems, processes and technologies that "differentiate AI outputs generated by the model", which a note says may include embedding indicators of provenance;
- show prominent warning messages to end-users in Australia seeking images of child sexual abuse material, and ensure that material generated using terms with known associations to child sexual exploitation material comes with information or links to reporting or support services; and
- detect automatically, and act on, child sexual abuse material in "training data, user prompts, and outputs".

A note to the section accepts that not every provider has full visibility or control of its models, and says a provider that cannot deploy all mitigations "will have to rely on other systems, processes and technologies that are available" (s 22(3), note 1).

Other sections apply to these services too. Providers must detect and remove known child sexual abuse material, which a note says may require assessing whether inputs contain it, subject to exceptions, including where that is not technically feasible or reasonably practicable, or would require building a systemic weakness into the service or, for an end-to-end encrypted service, a new decryption capability or less effective encryption ([standard, s 20](https://www.legislation.gov.au/F2024L00710/asmade/2024-06-21/text/original/epub/OEBPS/document_1/document_1.html)). A service with an average of 1,000,000 or more monthly active end-users in Australia over the previous calendar year must run a yearly development program, including investment to reduce the risk of class 1A and class 1B material "generated by artificial intelligence" (s 23). These services are exempt from the standard's initial risk assessment, which is how other services work out their tier, unless they are materially changed (s 7(6) and note).

The standard also covers "model distribution platforms", services whose purpose includes making machine learning models available and which let end-users upload them (s 6). Their terms of use must require account holders to have taken appropriate steps to minimise the risk that an uploaded model is used to generate child sexual exploitation or pro-terror material, and must give the provider rights to restrict or remove a model used that way (s 13(3)). A platform that becomes aware a model is being used for that purpose must take appropriate action, which a note says includes limiting access to the model (s 15(4)).

All designated internet services must notify the Commissioner of a new, removed or disabled feature unless the provider believes on reasonable grounds it will not significantly increase the risk of the service being used to generate high impact material (s 33). From the first anniversary of commencement, the Commissioner may by written notice require a compliance report no more than once in any 12 months, due within 2 months (s 36(2), (3), (5)). A high impact generative AI provider's report must also set out any limits on its ability to identify and act on the material and, where relevant, the design and technology features that cause them (s 36(9)).

## Who it affects

The standard binds providers of designated internet services in the categories it defines, including high impact generative AI services and model distribution platforms, with each category subject to the provisions listed against it in section 12 ([standard, s 12](https://www.legislation.gov.au/F2024L00710/asmade/2024-06-21/text/original/epub/OEBPS/document_1/document_1.html)). Under section 12(2), a service that is both a high impact generative AI DIS and a high impact or classified DIS must meet the measures for each kind (s 12(2)).

Messaging, email, dating and gaming services fall under a companion standard for relevant electronic services, which the register describes as requiring providers to consider the risk of AI-generated material ([record](/policies/federal-online-safety-relevant-electronic-services-industry-standard-2024)). Separate eSafety industry codes covering generative AI services and AI companion chatbots took effect on 9 March 2026 ([record](/policies/esafety-genai-industry-codes)).

The Digital Duty of Care Bill 2026 would replace the existing industry code framework with a digital duty of care ([APH bill page](https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Search_Results/Result?bId=r7553)). The register records that Schedule 3 would repeal the codes and standards 12 months after Royal Assent ([record](/policies/federal-online-safety-amendment-digital-duty-of-care-bill-2026)). The House passed the bill on 28 October 2026, and the Senate Environment and Communications Legislation Committee is due to report on 20 November 2026 ([APH bill page](https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Search_Results/Result?bId=r7553)). Until any repeal takes effect, the standard remains in force ([record](/policies/federal-online-safety-designated-internet-services-industry-standard-2024)). Policai's [note on the bill](/analysis/digital-duty-of-care-bill-2026) covers Schedule 3.

## Analysis

In Policai's analysis, the standard is narrow in subject but demanding within it. It concerns two classes of the most serious material, not AI safety in general, but within that scope it already asks high impact generative AI providers for model testing, output provenance and screening of training data. Its note on limited visibility and control is the main concession to providers that build on third-party models. The live question for the Senate committee is whether the duty of care bill carries these model-level measures forward in some form or leaves them to be rebuilt under the new framework once the standard is repealed.
