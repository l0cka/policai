import json
import re
import sys

TARGETS = [
    "afp-ai-strategy-2026-28",
    "dta-ai-reference-architecture",
    "vic-ovic-public-generative-ai-guidance",
    "vic-ovic-enterprise-generative-ai-guidance",
    "policy-responsible-use-ai-government-v2",
    "federal-online-safety-amendment-digital-duty-of-care-bill-2026",
    "asd-ai-considerations-within-the-essentials-2026",
    "tas-local-community-benefit-fund-ai-data-centres-2026",
    "tas-draft-statement-expectations-data-centres-ai-2026",
    "asic-market-integrity-rules-ai-trading-2026",
]

PHRASES = {
    "afp-ai-strategy-2026-28": [
        (
            "publishes the Artificial Intelligence Strategy 2026-28 at https://www.afp.gov.au/news-centre/publications/artificial-intelligence-strategy-2026-28, with the PDF at https://www.afp.gov.au/sites/default/files/2026-09/Artificial-Intelligence-Strategy.pdf.",
            "publishes the Artificial Intelligence Strategy 2026-28 on its publication page, with a PDF of the strategy.",
        ),
    ],
    "dta-ai-reference-architecture": [
        ("The resource is https://www.digital.gov.au/ai-reference-architecture.", "The resource is published on digital.gov.au."),
        ("The Companion Guide — Scenarios is https://www.digital.gov.au/ai-reference-architecture/companion-guide.", "The Companion Guide — Scenarios is a separate page of the resource."),
        (
            "The landing page offers https://www.digital.gov.au/sites/default/files/documents/2026-10/AI-Architecture-ACCESSIBLE.pdf and https://www.digital.gov.au/sites/default/files/documents/2026-10/AI-Architecture-Companion-Guide-ACCESSIBLE.pdf, each",
            "The landing page offers accessible PDFs of the architecture and of the companion guide, each",
        ),
    ],
    "policy-responsible-use-ai-government-v2": [
        ("Standard for AI transparency statements 2.1: https://www.digital.gov.au/ai/ai-in-government-policy/standard-ai-transparency-statements (https://www.digital.gov.au/sites/default/files/documents/2026-10/Standard%20for%20AI%20transparency%20statements%202_1.pdf).", "The Standard for AI transparency statements 2.1 has its own page and PDF."),
        ("Standard for accountability 2.1: https://www.digital.gov.au/ai/ai-in-government-policy/accountability (https://www.digital.gov.au/sites/default/files/documents/2026-10/Standard%20for%20accountable%20officials%202_1.pdf).", "The Standard for accountability 2.1 has its own page and PDF."),
        ("Live policy PDF: https://www.digital.gov.au/sites/default/files/documents/2026-10/Policy%20for%20the%20responsible%20use%20of%20AI%20in%20government%202_1_1.pdf.", "The policy page links the current policy PDF."),
    ],
    "federal-online-safety-amendment-digital-duty-of-care-bill-2026": [
        ("The department's page is https://www.infrastructure.gov.au/media-communications/internet/online-safety/digital-duty-care.", "The department has a page on the digital duty of care."),
    ],
    "asd-ai-considerations-within-the-essentials-2026": [
        ("and the PDF is at https://www.cyber.gov.au/sites/default/files/2026-10/AI%20considerations%20within%20the%20Essentials.pdf.", "and links a PDF of the publication."),
    ],
    "vic-ovic-public-generative-ai-guidance": [
        ("policy: https://prov.vic.gov.au/recordkeeping-government/a-z-topics/AI.OVIC", "policy. OVIC"),
    ],
    "vic-ovic-enterprise-generative-ai-guidance": [
        ("are available at: https://ovic.vic.gov.au/information-security/standards/Section", "are available on OVIC’s website. Section"),
    ],
    "tas-local-community-benefit-fund-ai-data-centres-2026": [
        ("Source: https://www.premier.tas.gov.au/latest-news/2026/october/major-ai-investment-must-deliver-for-tasmanian-communities.", "Source: the Premier's media release on premier.tas.gov.au."),
    ],
    "tas-draft-statement-expectations-data-centres-ai-2026": [
        ("Primary source: https://engage.building.tas.gov.au/draft-expectations-data-centres-and-ai-infrastructure-developers.", "Primary source: the consultation page on engage.building.tas.gov.au."),
    ],
}

URL = r"https?://[^\s)]+?"


def strip(text: str) -> str:
    text = re.sub(r"\s*\(" + URL + r"\)(?=[\s.,;:]|$)", "", text)
    text = re.sub(r"\(" + URL + r";\s*", "(", text)
    text = re.sub(r",\s*" + URL + r"(?=\))", "", text)
    text = re.sub(r":\s*https?://[^\s]*?(?:/|\.)(?=[A-Z])", ". ", text)
    text = re.sub(r":\s*https?://\S+?\.(?=\s|$)", ".", text)
    text = re.sub(r":\s*https?://\S+?/(?=\s|$)", ".", text)
    return text


def main(path: str) -> None:
    policies = json.load(open(path))
    out = {}
    for policy in policies:
        if policy["id"] not in TARGETS:
            continue
        content = policy["content"]
        for old, new in PHRASES.get(policy["id"], []):
            if old not in content:
                raise SystemExit(f"{policy['id']}: phrase not found: {old[:60]}")
            content = content.replace(old, new)
        content = strip(content)
        left = re.findall(r"https?://\S+", content)
        if left:
            raise SystemExit(f"{policy['id']}: URLs left: {left}")
        out[policy["id"]] = content
    missing = set(TARGETS) - set(out)
    if missing:
        raise SystemExit(f"missing records: {sorted(missing)}")
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
