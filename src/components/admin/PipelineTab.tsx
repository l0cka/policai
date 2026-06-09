import {
	RefreshCw,
	CheckCircle2,
	XCircle,
	Loader2,
	Play,
	Eye,
	ShieldCheck,
	Zap,
} from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	PIPELINE_STAGE_NAMES,
	VERIFICATION_OUTCOME_NAMES,
	getJurisdictionName,
	getPolicyTypeName,
} from "@/types";
import type {
	PipelineRun,
	ResearchFinding,
	VerificationResult,
	PipelineStage,
} from "@/types";

interface PipelineTabProps {
	pipelineRun: PipelineRun | null;
	pipelineFindings: ResearchFinding[];
	pipelineVerifications: VerificationResult[];
	pipelineRuns: PipelineRun[];
	isPipelineRunning: boolean;
	isPipelineApproving: boolean;
	selectedFindingIds: Set<string>;
	pipelineNotes: string;
	onPipelineNotesChange: (notes: string) => void;
	onFetchPipelineData: () => void;
	onStartPipeline: () => void;
	onApprovePipeline: () => void;
	onRejectPipeline: () => void;
	onToggleFindingSelection: (id: string) => void;
}

function getStageOrder(stage: PipelineStage): number {
	const order: Record<PipelineStage, number> = {
		research: 0,
		research_complete: 1,
		verification: 2,
		verification_complete: 3,
		hitl_review: 4,
		implementation: 5,
		complete: 6,
		failed: -1,
	};
	return order[stage] ?? -1;
}

function getPipelineStageColor(stage: PipelineStage): string {
	switch (stage) {
		case "research":
		case "verification":
		case "implementation":
			return "text-blue-500";
		case "research_complete":
		case "verification_complete":
			return "text-yellow-500";
		case "hitl_review":
			return "text-orange-500";
		case "complete":
			return "text-green-500";
		case "failed":
			return "text-red-500";
		default:
			return "text-muted-foreground";
	}
}

function getVerificationBadgeVariant(
	outcome: string,
): "default" | "secondary" | "outline" | "destructive" {
	switch (outcome) {
		case "confirmed":
			return "default";
		case "partially_confirmed":
			return "secondary";
		case "unverifiable":
			return "outline";
		case "contradicted":
			return "destructive";
		default:
			return "outline";
	}
}

export function PipelineTab({
	pipelineRun,
	pipelineFindings,
	pipelineVerifications,
	pipelineRuns,
	isPipelineRunning,
	isPipelineApproving,
	selectedFindingIds,
	pipelineNotes,
	onPipelineNotesChange,
	onFetchPipelineData,
	onStartPipeline,
	onApprovePipeline,
	onRejectPipeline,
	onToggleFindingSelection,
}: PipelineTabProps) {
	return (
		<div className="space-y-6">
			{/* Pipeline Controls */}
			<div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
				<div>
					<h2 className="text-xl font-semibold flex items-center gap-2">
						<Zap className="h-5 w-5" />
						AI Review Pipeline
					</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Automated research, verification, and implementation with
						human-in-the-loop review
					</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" size="sm" onClick={onFetchPipelineData}>
						<RefreshCw className="h-4 w-4 mr-2" />
						Refresh
					</Button>
					<Button
						onClick={onStartPipeline}
						disabled={isPipelineRunning || pipelineRun?.stage === "hitl_review"}
					>
						{isPipelineRunning ? (
							<>
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								Running Pipeline...
							</>
						) : (
							<>
								<Play className="h-4 w-4 mr-2" />
								Run Pipeline
							</>
						)}
					</Button>
				</div>
			</div>

			{/* Pipeline Stage Visualization */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Pipeline Stages</CardTitle>
					<CardDescription>
						Research &rarr; Verify &rarr; Human Review &rarr; Implement
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center gap-2 overflow-x-auto pb-2">
						{(
							[
								"research",
								"verification",
								"hitl_review",
								"implementation",
								"complete",
							] as PipelineStage[]
						).map((stage, idx) => {
							const isActive = pipelineRun?.stage === stage;
							const isPast =
								pipelineRun &&
								getStageOrder(pipelineRun.stage) > getStageOrder(stage);
							return (
								<div key={stage} className="flex items-center gap-2 flex-1">
									<div
										className={`flex items-center gap-2 px-3 py-2 rounded-lg border flex-1 text-center justify-center ${
											isActive
												? "border-primary bg-primary/10 font-medium"
												: isPast
													? "border-green-500/50 bg-green-50 dark:bg-green-950/30"
													: "border-muted"
										}`}
									>
										{isPast && (
											<CheckCircle2 className="h-4 w-4 text-green-500" />
										)}
										{isActive && (
											<Loader2 className="h-4 w-4 animate-spin text-primary" />
										)}
										<span className="text-sm">
											{PIPELINE_STAGE_NAMES[stage]}
										</span>
									</div>
									{idx < 4 && (
										<div
											className={`h-px w-4 ${isPast ? "bg-green-500" : "bg-muted"}`}
										/>
									)}
								</div>
							);
						})}
					</div>

					{pipelineRun && (
						<div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
							<div>
								<div className="text-2xl font-bold">
									{pipelineRun.findingsCount}
								</div>
								<p className="text-xs text-muted-foreground">Findings</p>
							</div>
							<div>
								<div className="text-2xl font-bold text-green-500">
									{pipelineRun.verifiedCount}
								</div>
								<p className="text-xs text-muted-foreground">Verified</p>
							</div>
							<div>
								<div className="text-2xl font-bold text-red-500">
									{pipelineRun.rejectedCount}
								</div>
								<p className="text-xs text-muted-foreground">Rejected</p>
							</div>
							<div>
								<div className="text-2xl font-bold text-blue-500">
									{pipelineRun.implementedCount}
								</div>
								<p className="text-xs text-muted-foreground">Implemented</p>
							</div>
						</div>
					)}

					{!pipelineRun && (
						<div className="mt-4 text-center py-4">
							<p className="text-muted-foreground">
								No pipeline runs yet. Click &quot;Run Pipeline&quot; to start.
							</p>
						</div>
					)}
				</CardContent>
			</Card>

			{/* HITL Review Section */}
			{pipelineRun?.stage === "hitl_review" && (
				<Card className="border-2 border-orange-400">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Eye className="h-5 w-5 text-orange-500" />
							Human Review Required
						</CardTitle>
						<CardDescription>
							The pipeline has completed research and verification. Review the
							findings below and approve or reject them before implementation.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{/* Verified Findings */}
						<h3 className="font-semibold text-sm flex items-center gap-2">
							<ShieldCheck className="h-4 w-4 text-green-500" />
							Verified Findings (
							{pipelineFindings.filter((f) => f.status === "verified").length})
						</h3>
						<ScrollArea className="h-[300px] sm:h-[400px]">
							<div className="space-y-3">
								{pipelineFindings
									.filter((f) => f.status === "verified")
									.map((finding) => {
										const verification = pipelineVerifications.find(
											(v) => v.findingId === finding.id,
										);
										return (
											<Card
												key={finding.id}
												className="border-l-4 border-l-green-400"
											>
												<CardContent className="pt-4">
													<div className="flex items-start gap-3">
														<input
															type="checkbox"
															checked={selectedFindingIds.has(finding.id)}
															onChange={() =>
																onToggleFindingSelection(finding.id)
															}
															className="mt-1 h-4 w-4 rounded"
														/>
														<div className="flex-1 min-w-0">
															<div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
																<div className="flex-1 min-w-0">
																	<h4 className="font-semibold text-sm">
																		{finding.title}
																	</h4>
																	<p className="text-xs text-muted-foreground mt-1">
																		{finding.summary}
																	</p>
																</div>
																<div className="flex gap-1 shrink-0">
																	<Badge variant="outline" className="text-xs">
																		{Math.round(finding.relevanceScore * 100)}%
																	</Badge>
																	{finding.isNewPolicy ? (
																		<Badge className="text-xs bg-blue-500">
																			New
																		</Badge>
																	) : (
																		<Badge
																			variant="secondary"
																			className="text-xs"
																		>
																			Update
																		</Badge>
																	)}
																</div>
															</div>
															<div className="mt-2 flex gap-1 flex-wrap">
																{finding.suggestedType && (
																	<Badge variant="outline" className="text-xs">
																		{getPolicyTypeName(finding.suggestedType)}
																	</Badge>
																)}
																{finding.suggestedJurisdiction && (
																	<Badge variant="outline" className="text-xs">
																		{getJurisdictionName(
																			finding.suggestedJurisdiction,
																		)}
																	</Badge>
																)}
																{finding.tags.slice(0, 3).map((tag, i) => (
																	<Badge
																		key={i}
																		variant="secondary"
																		className="text-xs"
																	>
																		{tag}
																	</Badge>
																))}
															</div>
															{verification && (
																<div className="mt-2 p-2 bg-muted/50 rounded text-xs">
																	<div className="flex items-center gap-2 mb-1">
																		<ShieldCheck className="h-3 w-3" />
																		<Badge
																			variant={getVerificationBadgeVariant(
																				verification.outcome,
																			)}
																			className="text-xs"
																		>
																			{
																				VERIFICATION_OUTCOME_NAMES[
																					verification.outcome as keyof typeof VERIFICATION_OUTCOME_NAMES
																				]
																			}
																		</Badge>
																		<span className="text-muted-foreground">
																			Confidence:{" "}
																			{Math.round(
																				verification.confidenceScore * 100,
																			)}
																			%
																		</span>
																	</div>
																	<p className="text-muted-foreground">
																		{verification.verificationNotes}
																	</p>
																	{verification.factualIssues.length > 0 && (
																		<div className="mt-1 text-orange-500">
																			Issues:{" "}
																			{verification.factualIssues.join("; ")}
																		</div>
																	)}
																</div>
															)}
															<div className="mt-2 text-xs text-muted-foreground break-all sm:break-normal">
																Source:{" "}
																<a
																	href={finding.sourceUrl}
																	target="_blank"
																	rel="noopener noreferrer"
																	className="text-primary hover:underline"
																>
																	{finding.sourceUrl}
																</a>{" "}
																&middot; Discovered:{" "}
																{new Date(finding.discoveredAt).toLocaleString(
																	"en-AU",
																)}
															</div>
														</div>
													</div>
												</CardContent>
											</Card>
										);
									})}

								{pipelineFindings.filter((f) => f.status === "verified")
									.length === 0 && (
									<p className="text-center text-muted-foreground py-4">
										No verified findings to review.
									</p>
								)}
							</div>
						</ScrollArea>

						{/* Rejected/Unverified Findings */}
						{pipelineFindings.filter(
							(f) => f.status === "discovered" || f.status === "rejected",
						).length > 0 && (
							<div>
								<h3 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground">
									<XCircle className="h-4 w-4 text-red-400" />
									Rejected / Unverified (
									{
										pipelineFindings.filter(
											(f) =>
												f.status === "discovered" || f.status === "rejected",
										).length
									}
									)
								</h3>
								<div className="mt-2 space-y-2">
									{pipelineFindings
										.filter(
											(f) =>
												f.status === "discovered" || f.status === "rejected",
										)
										.map((finding) => (
											<div
												key={finding.id}
												className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded text-sm"
											>
												<XCircle className="h-4 w-4 text-red-400 shrink-0" />
												<span className="flex-1">{finding.title}</span>
												<Badge variant="outline" className="text-xs">
													{Math.round(finding.relevanceScore * 100)}%
												</Badge>
											</div>
										))}
								</div>
							</div>
						)}

						<Separator />

						{/* Approval Controls */}
						<div className="space-y-3">
							<Label htmlFor="pipelineNotes">Review Notes (optional)</Label>
							<Textarea
								id="pipelineNotes"
								placeholder="Add any notes about this review..."
								value={pipelineNotes}
								onChange={(e) => onPipelineNotesChange(e.target.value)}
								className="min-h-[60px]"
							/>
							<div className="flex gap-2">
								<Button
									className="bg-green-600 hover:bg-green-700 flex-1"
									onClick={onApprovePipeline}
									disabled={isPipelineApproving}
								>
									{isPipelineApproving ? (
										<>
											<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											Implementing...
										</>
									) : (
										<>
											<CheckCircle2 className="h-4 w-4 mr-2" />
											{selectedFindingIds.size > 0
												? `Approve ${selectedFindingIds.size} Selected`
												: `Approve All Verified (${pipelineFindings.filter((f) => f.status === "verified").length})`}
										</>
									)}
								</Button>
								<Button
									variant="outline"
									className="text-red-600 hover:text-red-700"
									onClick={onRejectPipeline}
								>
									<XCircle className="h-4 w-4 mr-2" />
									Reject All
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Pipeline Run History */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Pipeline History</CardTitle>
					<CardDescription>
						Previous pipeline runs and their results
					</CardDescription>
				</CardHeader>
				<CardContent>
					{pipelineRuns.length > 0 ? (
						<div className="space-y-3">
							{pipelineRuns.slice(0, 10).map((run) => (
								<div
									key={run.id}
									className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-3 last:border-0 last:pb-0 gap-2"
								>
									<div className="flex items-center gap-3 min-w-0">
										<div
											className={`h-2 w-2 rounded-full shrink-0 ${
												run.stage === "complete"
													? "bg-green-500"
													: run.stage === "failed"
														? "bg-red-500"
														: run.stage === "hitl_review"
															? "bg-orange-500"
															: "bg-blue-500 animate-pulse"
											}`}
										/>
										<div className="min-w-0">
											<p className="text-sm font-medium truncate">{run.id}</p>
											<p className="text-xs text-muted-foreground">
												{new Date(run.startedAt).toLocaleString("en-AU")}
												{run.completedAt &&
													` - ${new Date(run.completedAt).toLocaleString("en-AU")}`}
											</p>
										</div>
									</div>
									<div className="flex items-center gap-2 flex-wrap ml-5 sm:ml-0">
										<Badge variant="outline" className="text-xs">
											{run.findingsCount} findings
										</Badge>
										<Badge variant="outline" className="text-xs">
											{run.verifiedCount} verified
										</Badge>
										<Badge variant="outline" className="text-xs">
											{run.implementedCount} implemented
										</Badge>
										<Badge
											className={`text-xs ${getPipelineStageColor(run.stage)}`}
										>
											{PIPELINE_STAGE_NAMES[run.stage]}
										</Badge>
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="text-center text-muted-foreground py-4">
							No pipeline runs yet.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
