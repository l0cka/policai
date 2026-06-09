import {
	FileText,
	Building2,
	Clock,
	Database,
	Loader2,
	TrendingUp,
	CheckCircle2,
	Trash2,
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
import { getJurisdictionName } from "@/types";

interface OverviewTabProps {
	isLoading: boolean;
	policiesCount: number;
	agenciesCount: number;
	pendingCount: number;
	sourcesCount: number;
	enabledSourcesCount: number;
	recentPolicies: Array<{
		id: string;
		title: string;
		jurisdiction: string;
		updatedAt: string;
	}>;
	onExportPolicies: () => void;
	onTrashPolicy: (policyId: string, title: string) => void;
}

export function OverviewTab({
	isLoading,
	policiesCount,
	agenciesCount,
	pendingCount,
	sourcesCount,
	enabledSourcesCount,
	recentPolicies,
	onExportPolicies,
	onTrashPolicy,
}: OverviewTabProps) {
	return (
		<div className="space-y-6">
			{/* Quick Stats */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
				<Card className="hover:shadow-lg transition-shadow">
					<CardContent className="pt-6">
						<div className="flex items-center gap-4">
							<div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
								<FileText className="h-6 w-6 text-primary" />
							</div>
							<div className="flex-1">
								<div className="text-2xl font-bold">
									{isLoading ? (
										<Loader2 className="h-6 w-6 animate-spin" />
									) : (
										policiesCount
									)}
								</div>
								<p className="text-sm text-muted-foreground">Total Policies</p>
								<div className="flex items-center gap-1 mt-1">
									<TrendingUp className="h-3 w-3 text-green-500" />
									<span className="text-xs text-green-500">
										+12% this month
									</span>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card className="hover:shadow-lg transition-shadow">
					<CardContent className="pt-6">
						<div className="flex items-center gap-4">
							<div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
								<Building2 className="h-6 w-6 text-primary" />
							</div>
							<div className="flex-1">
								<div className="text-2xl font-bold">
									{isLoading ? (
										<Loader2 className="h-6 w-6 animate-spin" />
									) : (
										agenciesCount
									)}
								</div>
								<p className="text-sm text-muted-foreground">Agencies</p>
								<div className="flex items-center gap-1 mt-1">
									<TrendingUp className="h-3 w-3 text-green-500" />
									<span className="text-xs text-green-500">+3 new</span>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card className="hover:shadow-lg transition-shadow">
					<CardContent className="pt-6">
						<div className="flex items-center gap-4">
							<div className="h-12 w-12 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
								<Clock className="h-6 w-6 text-yellow-600 dark:text-yellow-500" />
							</div>
							<div className="flex-1">
								<div className="text-2xl font-bold">
									{isLoading ? (
										<Loader2 className="h-6 w-6 animate-spin" />
									) : (
										pendingCount
									)}
								</div>
								<p className="text-sm text-muted-foreground">Pending Review</p>
								<div className="flex items-center gap-1 mt-1">
									<Clock className="h-3 w-3 text-yellow-500" />
									<span className="text-xs text-muted-foreground">
										Needs attention
									</span>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card className="hover:shadow-lg transition-shadow">
					<CardContent className="pt-6">
						<div className="flex items-center gap-4">
							<div className="h-12 w-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
								<Database className="h-6 w-6 text-green-600 dark:text-green-500" />
							</div>
							<div className="flex-1">
								<div className="text-2xl font-bold">{sourcesCount}</div>
								<p className="text-sm text-muted-foreground">Data Sources</p>
								<div className="flex items-center gap-1 mt-1">
									<CheckCircle2 className="h-3 w-3 text-green-500" />
									<span className="text-xs text-green-500">
										{enabledSourcesCount} active
									</span>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Recent Activity */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>Recent Activity</CardTitle>
							<CardDescription>Latest updates to the database</CardDescription>
						</div>
						<Button variant="outline" size="sm" onClick={onExportPolicies}>
							<FileText className="h-4 w-4 mr-2" />
							Export CSV
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<div className="flex items-center justify-center py-8">
							<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
						</div>
					) : (
						<div className="space-y-4">
							{recentPolicies.map((policy) => (
								<div
									key={policy.id}
									className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 last:border-0 last:pb-0 group gap-2"
								>
									<div className="flex items-center gap-3 flex-1 min-w-0">
										<FileText className="h-4 w-4 text-muted-foreground shrink-0" />
										<div className="flex-1 min-w-0">
											<p className="font-medium text-sm truncate">
												{policy.title}
											</p>
											<p className="text-xs text-muted-foreground">
												Updated{" "}
												{new Date(policy.updatedAt).toLocaleDateString("en-AU")}
											</p>
										</div>
									</div>
									<div className="flex items-center gap-2 ml-7 sm:ml-0">
										<Badge variant="outline">
											{getJurisdictionName(policy.jurisdiction)}
										</Badge>
										<Button
											variant="ghost"
											size="sm"
											className="opacity-0 group-hover:opacity-100 transition-opacity"
											onClick={() => onTrashPolicy(policy.id, policy.title)}
										>
											<Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
										</Button>
									</div>
								</div>
							))}
							{recentPolicies.length === 0 && (
								<p className="text-center text-muted-foreground py-4">
									No policies found
								</p>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
