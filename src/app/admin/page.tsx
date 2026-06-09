"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Loader2, Link as LinkIcon, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	JURISDICTION_NAMES,
	POLICY_TYPE_NAMES,
	POLICY_STATUS_NAMES,
	getJurisdictionName,
} from "@/types";
import type { PipelineRun, ResearchFinding, VerificationResult } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { supabase } from "@/lib/supabase";
import { OverviewTab } from "@/components/admin/OverviewTab";
import { ReviewTab, type PendingItem } from "@/components/admin/ReviewTab";
import { PipelineTab } from "@/components/admin/PipelineTab";
import { SourcesTab } from "@/components/admin/SourcesTab";
import { TrashTab } from "@/components/admin/TrashTab";
import { SettingsTab } from "@/components/admin/SettingsTab";

/**
 * Authenticated fetch wrapper that includes the Supabase session token.
 * Supabase stores auth tokens in localStorage (not cookies), so API routes
 * can't see them unless we explicitly pass them as Authorization headers.
 */
async function adminFetch(
	url: string,
	options: RequestInit = {},
): Promise<Response> {
	const {
		data: { session },
	} = await supabase.auth.getSession();
	const headers = new Headers(options.headers);

	if (session?.access_token) {
		headers.set("Authorization", `Bearer ${session.access_token}`);
	}
	if (!headers.has("Content-Type") && options.body) {
		headers.set("Content-Type", "application/json");
	}

	return fetch(url, { ...options, headers });
}

// Types for form data
interface PolicyFormData {
	title: string;
	description: string;
	jurisdiction: string;
	type: string;
	status: string;
	effectiveDate: string;
	sourceUrl: string;
	content: string;
	tags: string;
}

const initialFormData: PolicyFormData = {
	title: "",
	description: "",
	jurisdiction: "",
	type: "",
	status: "",
	effectiveDate: "",
	sourceUrl: "",
	content: "",
	tags: "",
};

// Data sources with automatic scraping
const dataSources = [
	{
		id: "source-1",
		name: "DTA AI Policy",
		url: "https://www.dta.gov.au/our-projects/artificial-intelligence",
		type: "scraper",
		schedule: "daily",
		lastRun: "2024-01-20T08:00:00Z",
		status: "healthy",
		itemsFound: 156,
		enabled: true,
	},
	{
		id: "source-2",
		name: "DISER AI Ethics Framework",
		url: "https://www.industry.gov.au/publications/australias-artificial-intelligence-ethics-framework",
		type: "scraper",
		schedule: "weekly",
		lastRun: "2024-01-20T09:30:00Z",
		status: "healthy",
		itemsFound: 42,
		enabled: true,
	},
	{
		id: "source-3",
		name: "CSIRO Data61 AI",
		url: "https://www.csiro.au/en/work-with-us/services/data61",
		type: "scraper",
		schedule: "weekly",
		lastRun: "2024-01-19T15:00:00Z",
		status: "healthy",
		itemsFound: 23,
		enabled: true,
	},
	{
		id: "source-4",
		name: "Australian Human Rights Commission",
		url: "https://humanrights.gov.au/",
		type: "scraper",
		schedule: "weekly",
		lastRun: "2024-01-18T10:00:00Z",
		status: "healthy",
		itemsFound: 18,
		enabled: true,
	},
	{
		id: "source-5",
		name: "OAIC Privacy & AI",
		url: "https://www.oaic.gov.au/",
		type: "scraper",
		schedule: "weekly",
		lastRun: "2024-01-20T14:00:00Z",
		status: "healthy",
		itemsFound: 31,
		enabled: true,
	},
	{
		id: "source-6",
		name: "NSW Digital AI Strategy",
		url: "https://www.digital.nsw.gov.au/",
		type: "scraper",
		schedule: "weekly",
		lastRun: "2024-01-19T11:00:00Z",
		status: "healthy",
		itemsFound: 12,
		enabled: true,
	},
	{
		id: "source-7",
		name: "Victorian AI Strategy",
		url: "https://www.vic.gov.au/artificial-intelligence",
		type: "scraper",
		schedule: "weekly",
		lastRun: "2024-01-18T16:00:00Z",
		status: "healthy",
		itemsFound: 15,
		enabled: false,
	},
	{
		id: "source-8",
		name: "ACCC Digital Platforms",
		url: "https://www.accc.gov.au/focus-areas/digital-platforms-and-services",
		type: "scraper",
		schedule: "monthly",
		lastRun: "2024-01-15T09:00:00Z",
		status: "healthy",
		itemsFound: 27,
		enabled: true,
	},
];

export default function AdminPage() {
	const [selectedTab, setSelectedTab] = useState("overview");
	const [isAddPolicyOpen, setIsAddPolicyOpen] = useState(false);
	const [isAnalyseUrlOpen, setIsAnalyseUrlOpen] = useState(false);
	const [pendingContent, setPendingContent] = useState<PendingItem[]>([]);
	const [policiesCount, setPoliciesCount] = useState(0);
	const [agenciesCount, setAgenciesCount] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [isAnalysing, setIsAnalysing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [urlToAnalyse, setUrlToAnalyse] = useState("");
	const [formData, setFormData] = useState<PolicyFormData>(initialFormData);
	const [recentPolicies, setRecentPolicies] = useState<
		Array<{
			id: string;
			title: string;
			jurisdiction: string;
			updatedAt: string;
		}>
	>([]);
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
	const [filterRelevance, setFilterRelevance] = useState<
		"all" | "high" | "medium" | "low"
	>("all");
	const [trashedPolicies, setTrashedPolicies] = useState<
		Array<{
			id: string;
			title: string;
			jurisdiction: string;
			trashedAt: string;
		}>
	>([]);
	const [sources, setSources] = useState(dataSources);
	const [isRunningSource, setIsRunningSource] = useState<string | null>(null);
	const [pipelineRun, setPipelineRun] = useState<PipelineRun | null>(null);
	const [pipelineFindings, setPipelineFindings] = useState<ResearchFinding[]>(
		[],
	);
	const [pipelineVerifications, setPipelineVerifications] = useState<
		VerificationResult[]
	>([]);
	const [pipelineRuns, setPipelineRuns] = useState<PipelineRun[]>([]);
	const [isPipelineRunning, setIsPipelineRunning] = useState(false);
	const [isPipelineApproving, setIsPipelineApproving] = useState(false);
	const [selectedFindingIds, setSelectedFindingIds] = useState<Set<string>>(
		new Set(),
	);
	const [pipelineNotes, setPipelineNotes] = useState("");
	const { toast } = useToast();

	// Fetch pending content
	const fetchPendingContent = useCallback(async () => {
		try {
			const response = await adminFetch(
				"/api/admin/pending?status=pending_review",
			);
			const data = await response.json();
			if (data.success) {
				setPendingContent(data.data);
			}
		} catch (error) {
			console.error("Failed to fetch pending content:", error);
		}
	}, []);

	// Fetch counts and recent policies
	const fetchData = useCallback(async () => {
		setIsLoading(true);
		try {
			const [pendingRes, policiesRes, trashedRes] = await Promise.all([
				adminFetch("/api/admin/pending?status=pending_review"),
				adminFetch("/api/policies"),
				adminFetch("/api/policies?status=trashed"),
			]);

			const [pendingData, policiesData, trashedData] = await Promise.all([
				pendingRes.json(),
				policiesRes.json(),
				trashedRes.json(),
			]);

			if (pendingData.success) {
				setPendingContent(pendingData.data);
			}

			if (policiesData.success) {
				setPoliciesCount(policiesData.total);
				setRecentPolicies(policiesData.data.slice(0, 5));
			}

			if (trashedData.success) {
				setTrashedPolicies(trashedData.data || []);
			}

			// Load agencies count from sample data
			const agenciesRes = await fetch("/data/sample-agencies.json");
			const agenciesData = await agenciesRes.json();
			setAgenciesCount(agenciesData.length);
		} catch (error) {
			console.error("Failed to fetch data:", error);
			toast({
				title: "Error",
				description: "Failed to load data",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	}, [toast]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	// Analyse URL
	const handleAnalyseUrl = async () => {
		if (!urlToAnalyse.trim()) {
			toast({
				title: "Error",
				description: "Please enter a URL to analyse",
				variant: "destructive",
			});
			return;
		}

		setIsAnalysing(true);
		try {
			// Analyse the URL
			const analyseResponse = await adminFetch("/api/admin/analyse-url", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: urlToAnalyse }),
			});

			const analyseData = await analyseResponse.json();

			if (!analyseData.success) {
				throw new Error(analyseData.error || "Failed to analyse URL");
			}

			// Add to pending content
			const addResponse = await adminFetch("/api/admin/pending", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: urlToAnalyse,
					title: analyseData.data.title,
					analysis: analyseData.data.analysis,
				}),
			});

			const addData = await addResponse.json();

			if (!addData.success) {
				throw new Error(addData.error || "Failed to add to pending");
			}

			toast({
				title: "URL Analysed",
				description: `${analyseData.data.title} has been added to pending content for review.`,
			});

			setUrlToAnalyse("");
			setIsAnalyseUrlOpen(false);
			fetchPendingContent();
		} catch (error) {
			toast({
				title: "Error",
				description:
					error instanceof Error ? error.message : "Failed to analyse URL",
				variant: "destructive",
			});
		} finally {
			setIsAnalysing(false);
		}
	};

	// Approve pending content
	const handleApprove = async (item: PendingItem) => {
		try {
			// Update status to approved
			const updateResponse = await adminFetch("/api/admin/pending", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: item.id, status: "approved" }),
			});

			if (!updateResponse.ok) {
				throw new Error("Failed to update status");
			}

			// Add as a policy
			const policyResponse = await adminFetch("/api/policies", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title: item.title,
					description: item.aiAnalysis.summary,
					jurisdiction: item.aiAnalysis.suggestedJurisdiction || "federal",
					type: item.aiAnalysis.suggestedType || "guideline",
					status: "active",
					sourceUrl: item.source,
					tags: item.aiAnalysis.tags || [],
					agencies: item.aiAnalysis.agencies || [],
				}),
			});

			const policyData = await policyResponse.json();

			if (!policyData.success) {
				throw new Error(policyData.error || "Failed to add policy");
			}

			toast({
				title: "Content Approved",
				description: `"${item.title}" has been added to the policy database.`,
			});

			fetchData();
		} catch (error) {
			toast({
				title: "Error",
				description:
					error instanceof Error ? error.message : "Failed to approve content",
				variant: "destructive",
			});
		}
	};

	// Reject pending content
	const handleReject = async (item: PendingItem) => {
		try {
			const response = await adminFetch("/api/admin/pending", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: item.id, status: "rejected" }),
			});

			if (!response.ok) {
				throw new Error("Failed to reject content");
			}

			toast({
				title: "Content Rejected",
				description: `"${item.title}" has been rejected and removed from the queue.`,
			});

			fetchPendingContent();
		} catch (error) {
			toast({
				title: "Error",
				description:
					error instanceof Error ? error.message : "Failed to reject content",
				variant: "destructive",
			});
		}
	};

	// Delete pending content
	const handleDelete = async (id: string) => {
		try {
			const response = await adminFetch(`/api/admin/pending?id=${id}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error("Failed to delete content");
			}

			toast({
				title: "Content Deleted",
				description: "The pending content has been removed.",
			});

			fetchPendingContent();
		} catch (error) {
			toast({
				title: "Error",
				description:
					error instanceof Error ? error.message : "Failed to delete content",
				variant: "destructive",
			});
		}
	};

	// Add policy manually
	const handleAddPolicy = async () => {
		if (
			!formData.title ||
			!formData.jurisdiction ||
			!formData.type ||
			!formData.status
		) {
			toast({
				title: "Error",
				description: "Please fill in all required fields",
				variant: "destructive",
			});
			return;
		}

		setIsSaving(true);
		try {
			const response = await adminFetch("/api/policies", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...formData,
					tags: formData.tags
						.split(",")
						.map((t) => t.trim())
						.filter(Boolean),
				}),
			});

			const data = await response.json();

			if (!data.success) {
				throw new Error(data.error || "Failed to add policy");
			}

			toast({
				title: "Policy Added",
				description: `"${formData.title}" has been added to the database.`,
			});

			setFormData(initialFormData);
			setIsAddPolicyOpen(false);
			fetchData();
		} catch (error) {
			toast({
				title: "Error",
				description:
					error instanceof Error ? error.message : "Failed to add policy",
				variant: "destructive",
			});
		} finally {
			setIsSaving(false);
		}
	};

	// Pre-fill form from pending content (Edit & Approve)
	const handleEditAndApprove = (item: PendingItem) => {
		setFormData({
			title: item.title,
			description: item.aiAnalysis.summary,
			jurisdiction: item.aiAnalysis.suggestedJurisdiction || "",
			type: item.aiAnalysis.suggestedType || "",
			status: "active",
			effectiveDate: "",
			sourceUrl: item.source,
			content: "",
			tags: item.aiAnalysis.tags?.join(", ") || "",
		});
		setIsAddPolicyOpen(true);
	};

	// Batch approve selected items
	const handleBatchApprove = async () => {
		const selectedArray = Array.from(selectedItems);
		if (selectedArray.length === 0) return;

		try {
			await Promise.all(
				selectedArray.map((id) => {
					const item = pendingContent.find((i) => i.id === id);
					return item ? handleApprove(item) : Promise.resolve();
				}),
			);
			setSelectedItems(new Set());
			toast({
				title: "Batch Approved",
				description: `${selectedArray.length} items have been approved.`,
			});
		} catch {
			toast({
				title: "Error",
				description: "Failed to approve some items",
				variant: "destructive",
			});
		}
	};

	// Batch reject selected items
	const handleBatchReject = async () => {
		const selectedArray = Array.from(selectedItems);
		if (selectedArray.length === 0) return;

		try {
			await Promise.all(
				selectedArray.map((id) => {
					const item = pendingContent.find((i) => i.id === id);
					return item ? handleReject(item) : Promise.resolve();
				}),
			);
			setSelectedItems(new Set());
			toast({
				title: "Batch Rejected",
				description: `${selectedArray.length} items have been rejected.`,
			});
		} catch {
			toast({
				title: "Error",
				description: "Failed to reject some items",
				variant: "destructive",
			});
		}
	};

	// Toggle item selection
	const toggleItemSelection = (id: string) => {
		const newSelected = new Set(selectedItems);
		if (newSelected.has(id)) {
			newSelected.delete(id);
		} else {
			newSelected.add(id);
		}
		setSelectedItems(newSelected);
	};

	// Select all items
	const toggleSelectAll = () => {
		if (selectedItems.size === filteredContent.length) {
			setSelectedItems(new Set());
		} else {
			setSelectedItems(new Set(filteredContent.map((item) => item.id)));
		}
	};

	// Filter content based on search and relevance
	const filteredContent = pendingContent.filter((item) => {
		// Search filter
		const matchesSearch =
			searchQuery === "" ||
			item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
			item.aiAnalysis.summary.toLowerCase().includes(searchQuery.toLowerCase());

		// Relevance filter
		const score = item.aiAnalysis.relevanceScore;
		const matchesRelevance =
			filterRelevance === "all" ||
			(filterRelevance === "high" && score >= 0.8) ||
			(filterRelevance === "medium" && score >= 0.5 && score < 0.8) ||
			(filterRelevance === "low" && score < 0.5);

		return matchesSearch && matchesRelevance;
	});

	// Export policies as CSV
	const handleExportPolicies = () => {
		const csvContent = [
			["Title", "Jurisdiction", "Type", "Status", "Updated"],
			...recentPolicies.map((p) => [
				p.title,
				getJurisdictionName(p.jurisdiction),
				p.jurisdiction,
				"Active",
				new Date(p.updatedAt).toLocaleDateString("en-AU"),
			]),
		]
			.map((row) => row.join(","))
			.join("\n");

		const blob = new Blob([csvContent], { type: "text/csv" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `policai-policies-${new Date().toISOString().split("T")[0]}.csv`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		toast({
			title: "Export Complete",
			description: "Policies exported successfully",
		});
	};

	// Move policy to trash
	const handleTrashPolicy = async (policyId: string, title: string) => {
		try {
			const response = await adminFetch(`/api/policies/${policyId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "trashed" }),
			});

			if (!response.ok) {
				throw new Error("Failed to trash policy");
			}

			toast({
				title: "Policy Moved to Trash",
				description: `"${title}" has been moved to trash.`,
			});

			fetchData();
		} catch (error) {
			toast({
				title: "Error",
				description:
					error instanceof Error ? error.message : "Failed to trash policy",
				variant: "destructive",
			});
		}
	};

	// Restore policy from trash
	const handleRestorePolicy = async (policyId: string, title: string) => {
		try {
			const response = await adminFetch(`/api/policies/${policyId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: "active" }),
			});

			if (!response.ok) {
				throw new Error("Failed to restore policy");
			}

			toast({
				title: "Policy Restored",
				description: `"${title}" has been restored.`,
			});

			fetchData();
		} catch (error) {
			toast({
				title: "Error",
				description:
					error instanceof Error ? error.message : "Failed to restore policy",
				variant: "destructive",
			});
		}
	};

	// Permanently delete policy
	const handlePermanentDelete = async (policyId: string, title: string) => {
		if (
			!confirm(
				`Are you sure you want to permanently delete "${title}"? This action cannot be undone.`,
			)
		) {
			return;
		}

		try {
			const response = await adminFetch(`/api/policies/${policyId}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error("Failed to delete policy");
			}

			toast({
				title: "Policy Deleted",
				description: `"${title}" has been permanently deleted.`,
			});

			fetchData();
		} catch (error) {
			toast({
				title: "Error",
				description:
					error instanceof Error ? error.message : "Failed to delete policy",
				variant: "destructive",
			});
		}
	};

	// Run data source scraper
	const handleRunScraper = async (sourceId: string, sourceName: string) => {
		setIsRunningSource(sourceId);
		try {
			const response = await adminFetch("/api/admin/run-scraper", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sourceId }),
			});

			const data = await response.json();

			if (!data.success) {
				throw new Error(data.error || "Failed to run scraper");
			}

			toast({
				title: "Scraper Running",
				description: `${sourceName} scraper has been started. Found ${data.itemsFound || 0} new items.`,
			});

			// Update the source with new data
			setSources((prev) =>
				prev.map((s) =>
					s.id === sourceId
						? {
								...s,
								lastRun: new Date().toISOString(),
								itemsFound: data.itemsFound || s.itemsFound,
							}
						: s,
				),
			);
		} catch (error) {
			toast({
				title: "Error",
				description:
					error instanceof Error ? error.message : "Failed to run scraper",
				variant: "destructive",
			});
		} finally {
			setIsRunningSource(null);
		}
	};

	// Toggle source enabled/disabled
	const handleToggleSource = (sourceId: string) => {
		setSources((prev) =>
			prev.map((s) => (s.id === sourceId ? { ...s, enabled: !s.enabled } : s)),
		);

		const source = sources.find((s) => s.id === sourceId);
		toast({
			title: source?.enabled ? "Source Disabled" : "Source Enabled",
			description: `${source?.name} has been ${source?.enabled ? "disabled" : "enabled"}.`,
		});
	};

	// Fetch pipeline data
	const fetchPipelineData = useCallback(async () => {
		try {
			const [latestRes, runsRes] = await Promise.all([
				adminFetch("/api/admin/pipeline?action=latest"),
				adminFetch("/api/admin/pipeline?action=runs"),
			]);

			const [latestData, runsData] = await Promise.all([
				latestRes.json(),
				runsRes.json(),
			]);

			if (latestData.success && latestData.data) {
				setPipelineRun(latestData.data.run);
				setPipelineFindings(latestData.data.findings || []);
				setPipelineVerifications(latestData.data.verifications || []);
			}

			if (runsData.success) {
				setPipelineRuns(runsData.data || []);
			}
		} catch (error) {
			console.error("Failed to fetch pipeline data:", error);
		}
	}, []);

	useEffect(() => {
		if (selectedTab === "pipeline") {
			fetchPipelineData();
		}
	}, [selectedTab, fetchPipelineData]);

	// Start pipeline run
	const handleStartPipeline = async () => {
		setIsPipelineRunning(true);
		try {
			const response = await adminFetch("/api/admin/pipeline", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "start" }),
			});

			const data = await response.json();

			if (!data.success) {
				throw new Error(data.error || "Failed to start pipeline");
			}

			toast({
				title: "Pipeline Started",
				description: data.message,
			});

			await fetchPipelineData();
		} catch (error) {
			toast({
				title: "Error",
				description:
					error instanceof Error ? error.message : "Failed to start pipeline",
				variant: "destructive",
			});
		} finally {
			setIsPipelineRunning(false);
		}
	};

	// Approve pipeline run
	const handleApprovePipeline = async () => {
		if (!pipelineRun) return;
		setIsPipelineApproving(true);
		try {
			const approvedIds =
				selectedFindingIds.size > 0
					? Array.from(selectedFindingIds)
					: undefined;

			const response = await adminFetch("/api/admin/pipeline", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "approve",
					runId: pipelineRun.id,
					notes: pipelineNotes || undefined,
					approvedFindingIds: approvedIds,
				}),
			});

			const data = await response.json();

			if (!data.success) {
				throw new Error(data.error || "Failed to approve pipeline");
			}

			toast({
				title: "Pipeline Approved",
				description: data.message,
			});

			setSelectedFindingIds(new Set());
			setPipelineNotes("");
			await fetchPipelineData();
			fetchData();
		} catch (error) {
			toast({
				title: "Error",
				description:
					error instanceof Error ? error.message : "Failed to approve pipeline",
				variant: "destructive",
			});
		} finally {
			setIsPipelineApproving(false);
		}
	};

	// Reject pipeline run
	const handleRejectPipeline = async () => {
		if (!pipelineRun) return;
		try {
			const response = await adminFetch("/api/admin/pipeline", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "reject",
					runId: pipelineRun.id,
					notes: pipelineNotes || "Rejected by admin",
				}),
			});

			const data = await response.json();

			if (!data.success) {
				throw new Error(data.error || "Failed to reject pipeline");
			}

			toast({
				title: "Pipeline Rejected",
				description: data.message,
			});

			setPipelineNotes("");
			await fetchPipelineData();
		} catch (error) {
			toast({
				title: "Error",
				description:
					error instanceof Error ? error.message : "Failed to reject pipeline",
				variant: "destructive",
			});
		}
	};

	// Toggle finding selection for selective approval
	const toggleFindingSelection = (id: string) => {
		const newSelected = new Set(selectedFindingIds);
		if (newSelected.has(id)) {
			newSelected.delete(id);
		} else {
			newSelected.add(id);
		}
		setSelectedFindingIds(newSelected);
	};

	return (
		<ProtectedRoute>
			<div className="container mx-auto px-4 py-8">
				<Toaster />
				<div className="mb-8 flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-bold">Admin Dashboard</h1>
						<p className="mt-2 text-muted-foreground">
							Manage content, review AI suggestions, and configure data sources
						</p>
					</div>
					<div className="flex gap-2">
						<Dialog open={isAnalyseUrlOpen} onOpenChange={setIsAnalyseUrlOpen}>
							<DialogTrigger asChild>
								<Button variant="outline">
									<LinkIcon className="h-4 w-4 mr-2" />
									Analyse URL
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Analyse URL for AI Policy Content</DialogTitle>
									<DialogDescription>
										Enter a URL to analyse with AI and determine if it contains
										relevant AI policy content
									</DialogDescription>
								</DialogHeader>
								<div className="grid gap-4 py-4">
									<div className="grid gap-2">
										<Label htmlFor="url">URL to Analyse</Label>
										<Input
											id="url"
											placeholder="https://www.example.gov.au/ai-policy"
											value={urlToAnalyse}
											onChange={(e) => setUrlToAnalyse(e.target.value)}
										/>
									</div>
								</div>
								<DialogFooter>
									<Button
										variant="outline"
										onClick={() => setIsAnalyseUrlOpen(false)}
									>
										Cancel
									</Button>
									<Button onClick={handleAnalyseUrl} disabled={isAnalysing}>
										{isAnalysing ? (
											<>
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
												Analysing...
											</>
										) : (
											<>
												<Search className="h-4 w-4 mr-2" />
												Analyse
											</>
										)}
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>

						<Dialog open={isAddPolicyOpen} onOpenChange={setIsAddPolicyOpen}>
							<DialogTrigger asChild>
								<Button>
									<Plus className="h-4 w-4 mr-2" />
									Add Policy
								</Button>
							</DialogTrigger>
							<DialogContent className="max-w-2xl">
								<DialogHeader>
									<DialogTitle>Add New Policy</DialogTitle>
									<DialogDescription>
										Manually add a new AI policy to the database
									</DialogDescription>
								</DialogHeader>
								<div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
									<div className="grid gap-2">
										<Label htmlFor="title">Title *</Label>
										<Input
											id="title"
											placeholder="Policy title"
											value={formData.title}
											onChange={(e) =>
												setFormData({ ...formData, title: e.target.value })
											}
										/>
									</div>
									<div className="grid gap-2">
										<Label htmlFor="description">Description</Label>
										<Textarea
											id="description"
											placeholder="Brief description of the policy"
											value={formData.description}
											onChange={(e) =>
												setFormData({
													...formData,
													description: e.target.value,
												})
											}
										/>
									</div>
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
										<div className="grid gap-2">
											<Label>Jurisdiction *</Label>
											<Select
												value={formData.jurisdiction}
												onValueChange={(value) =>
													setFormData({ ...formData, jurisdiction: value })
												}
											>
												<SelectTrigger>
													<SelectValue placeholder="Select jurisdiction" />
												</SelectTrigger>
												<SelectContent>
													{Object.entries(JURISDICTION_NAMES).map(
														([key, name]) => (
															<SelectItem key={key} value={key}>
																{name}
															</SelectItem>
														),
													)}
												</SelectContent>
											</Select>
										</div>
										<div className="grid gap-2">
											<Label>Type *</Label>
											<Select
												value={formData.type}
												onValueChange={(value) =>
													setFormData({ ...formData, type: value })
												}
											>
												<SelectTrigger>
													<SelectValue placeholder="Select type" />
												</SelectTrigger>
												<SelectContent>
													{Object.entries(POLICY_TYPE_NAMES).map(
														([key, name]) => (
															<SelectItem key={key} value={key}>
																{name}
															</SelectItem>
														),
													)}
												</SelectContent>
											</Select>
										</div>
									</div>
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
										<div className="grid gap-2">
											<Label>Status *</Label>
											<Select
												value={formData.status}
												onValueChange={(value) =>
													setFormData({ ...formData, status: value })
												}
											>
												<SelectTrigger>
													<SelectValue placeholder="Select status" />
												</SelectTrigger>
												<SelectContent>
													{Object.entries(POLICY_STATUS_NAMES).map(
														([key, name]) => (
															<SelectItem key={key} value={key}>
																{name}
															</SelectItem>
														),
													)}
												</SelectContent>
											</Select>
										</div>
										<div className="grid gap-2">
											<Label htmlFor="effectiveDate">Effective Date</Label>
											<Input
												id="effectiveDate"
												type="date"
												value={formData.effectiveDate}
												onChange={(e) =>
													setFormData({
														...formData,
														effectiveDate: e.target.value,
													})
												}
											/>
										</div>
									</div>
									<div className="grid gap-2">
										<Label htmlFor="sourceUrl">Source URL</Label>
										<Input
											id="sourceUrl"
											placeholder="https://"
											value={formData.sourceUrl}
											onChange={(e) =>
												setFormData({ ...formData, sourceUrl: e.target.value })
											}
										/>
									</div>
									<div className="grid gap-2">
										<Label htmlFor="tags">Tags (comma-separated)</Label>
										<Input
											id="tags"
											placeholder="AI ethics, transparency, regulation"
											value={formData.tags}
											onChange={(e) =>
												setFormData({ ...formData, tags: e.target.value })
											}
										/>
									</div>
									<div className="grid gap-2">
										<Label htmlFor="content">Content / Notes</Label>
										<Textarea
											id="content"
											placeholder="Additional content or notes about the policy"
											value={formData.content}
											onChange={(e) =>
												setFormData({ ...formData, content: e.target.value })
											}
											className="min-h-[100px]"
										/>
									</div>
								</div>
								<DialogFooter>
									<Button
										variant="outline"
										onClick={() => setIsAddPolicyOpen(false)}
									>
										Cancel
									</Button>
									<Button onClick={handleAddPolicy} disabled={isSaving}>
										{isSaving ? (
											<>
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
												Saving...
											</>
										) : (
											"Add Policy"
										)}
									</Button>
								</DialogFooter>
							</DialogContent>
						</Dialog>
					</div>
				</div>

				<Tabs value={selectedTab} onValueChange={setSelectedTab}>
					<div className="overflow-x-auto -mx-4 px-4 mb-8">
						<TabsList className="w-max">
							<TabsTrigger value="overview">Overview</TabsTrigger>
							<TabsTrigger value="review">
								Content Review
								{pendingContent.length > 0 && (
									<Badge variant="secondary" className="ml-2">
										{pendingContent.length}
									</Badge>
								)}
							</TabsTrigger>
							<TabsTrigger value="pipeline">
								AI Pipeline
								{pipelineRun?.stage === "hitl_review" && (
									<Badge variant="default" className="ml-2 bg-orange-500">
										Review
									</Badge>
								)}
							</TabsTrigger>
							<TabsTrigger value="sources">Data Sources</TabsTrigger>
							<TabsTrigger value="trash">
								Trash
								{trashedPolicies.length > 0 && (
									<Badge variant="destructive" className="ml-2">
										{trashedPolicies.length}
									</Badge>
								)}
							</TabsTrigger>
							<TabsTrigger value="settings">Settings</TabsTrigger>
						</TabsList>
					</div>

					<TabsContent value="overview" className="space-y-6">
						<OverviewTab
							isLoading={isLoading}
							policiesCount={policiesCount}
							agenciesCount={agenciesCount}
							pendingCount={pendingContent.length}
							sourcesCount={sources.length}
							enabledSourcesCount={sources.filter((s) => s.enabled).length}
							recentPolicies={recentPolicies}
							onExportPolicies={handleExportPolicies}
							onTrashPolicy={handleTrashPolicy}
						/>
					</TabsContent>

					<TabsContent value="review" className="space-y-6">
						<ReviewTab
							pendingContent={pendingContent}
							filteredContent={filteredContent}
							searchQuery={searchQuery}
							onSearchQueryChange={setSearchQuery}
							filterRelevance={filterRelevance}
							onFilterRelevanceChange={setFilterRelevance}
							selectedItems={selectedItems}
							onToggleItemSelection={toggleItemSelection}
							onToggleSelectAll={toggleSelectAll}
							onFetchPendingContent={fetchPendingContent}
							onApprove={handleApprove}
							onReject={handleReject}
							onDelete={handleDelete}
							onEditAndApprove={handleEditAndApprove}
							onBatchApprove={handleBatchApprove}
							onBatchReject={handleBatchReject}
							onClearSelection={() => setSelectedItems(new Set())}
							onOpenAnalyseUrl={() => setIsAnalyseUrlOpen(true)}
						/>
					</TabsContent>

					<TabsContent value="pipeline" className="space-y-6">
						<PipelineTab
							pipelineRun={pipelineRun}
							pipelineFindings={pipelineFindings}
							pipelineVerifications={pipelineVerifications}
							pipelineRuns={pipelineRuns}
							isPipelineRunning={isPipelineRunning}
							isPipelineApproving={isPipelineApproving}
							selectedFindingIds={selectedFindingIds}
							pipelineNotes={pipelineNotes}
							onPipelineNotesChange={setPipelineNotes}
							onFetchPipelineData={fetchPipelineData}
							onStartPipeline={handleStartPipeline}
							onApprovePipeline={handleApprovePipeline}
							onRejectPipeline={handleRejectPipeline}
							onToggleFindingSelection={toggleFindingSelection}
						/>
					</TabsContent>

					<TabsContent value="sources" className="space-y-6">
						<SourcesTab
							sources={sources}
							isRunningSource={isRunningSource}
							onRunScraper={handleRunScraper}
							onToggleSource={handleToggleSource}
						/>
					</TabsContent>

					<TabsContent value="trash" className="space-y-6">
						<TrashTab
							isLoading={isLoading}
							trashedPolicies={trashedPolicies}
							onRefresh={fetchData}
							onRestorePolicy={handleRestorePolicy}
							onPermanentDelete={handlePermanentDelete}
						/>
					</TabsContent>

					<TabsContent value="settings" className="space-y-6">
						<SettingsTab />
					</TabsContent>
				</Tabs>
			</div>
		</ProtectedRoute>
	);
}
