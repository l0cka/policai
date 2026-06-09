import { describe, expect, it } from "vitest";
import {
	getJurisdictionName,
	getPolicyStatusName,
	getPolicyTypeName,
	isPolicyType,
	isSourceReviewEntryKind,
	isSourceReviewStatus,
	normalizeJurisdiction,
	normalizePolicyStatus,
	normalizePolicyType,
	normalizeTimelineEventType,
} from "./index";

describe("domain type helpers", () => {
	it("recognises and normalises policy types", () => {
		expect(isPolicyType("framework")).toBe(true);
		expect(isPolicyType("unexpected_type")).toBe(false);
		expect(normalizePolicyType("practice_note")).toBe("practice_note");
		expect(normalizePolicyType("unexpected_type")).toBe("guideline");
	});

	it("normalises jurisdiction, policy status, and timeline event strings", () => {
		expect(normalizeJurisdiction("act")).toBe("act");
		expect(normalizeJurisdiction("unknown")).toBe("federal");
		expect(normalizePolicyStatus("repealed")).toBe("repealed");
		expect(normalizePolicyStatus("unknown")).toBe("active");
		expect(normalizeTimelineEventType("milestone")).toBe("milestone");
		expect(normalizeTimelineEventType("unknown")).toBe("announcement");
	});

	it("recognises source review wire values", () => {
		expect(isSourceReviewStatus("pending_review")).toBe(true);
		expect(isSourceReviewStatus("pending")).toBe(false);
		expect(isSourceReviewEntryKind("timeline_event")).toBe(true);
		expect(isSourceReviewEntryKind("news")).toBe(false);
	});

	it("returns display names and safe fallbacks", () => {
		expect(getJurisdictionName("federal")).toBe("Federal");
		expect(getJurisdictionName("external")).toBe("external");
		expect(getPolicyTypeName("funding_program")).toBe("Funding Program");
		expect(getPolicyTypeName("custom_type")).toBe("Custom Type");
		expect(getPolicyStatusName("proposed")).toBe("Proposed");
		expect(getPolicyStatusName("archived")).toBe("archived");
	});
});
