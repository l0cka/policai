import { RefreshCw, Loader2, Trash2 } from "lucide-react";
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

interface TrashTabProps {
	isLoading: boolean;
	trashedPolicies: Array<{
		id: string;
		title: string;
		jurisdiction: string;
		trashedAt: string;
	}>;
	onRefresh: () => void;
	onRestorePolicy: (policyId: string, title: string) => void;
	onPermanentDelete: (policyId: string, title: string) => void;
}

export function TrashTab({
	isLoading,
	trashedPolicies,
	onRefresh,
	onRestorePolicy,
	onPermanentDelete,
}: TrashTabProps) {
	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="flex items-center gap-2">
								<Trash2 className="h-5 w-5" />
								Trashed Policies
							</CardTitle>
							<CardDescription>
								Policies moved to trash. They can be restored or permanently
								deleted.
							</CardDescription>
						</div>
						<Button variant="outline" size="sm" onClick={onRefresh}>
							<RefreshCw className="h-4 w-4 mr-2" />
							Refresh
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
							{trashedPolicies.map((policy) => (
								<Card key={policy.id} className="border-l-4 border-l-red-400">
									<CardContent className="pt-6">
										<div className="flex items-start justify-between">
											<div className="flex-1">
												<h3 className="font-semibold">{policy.title}</h3>
												<div className="flex items-center gap-2 mt-2">
													<Badge variant="outline">
														{getJurisdictionName(policy.jurisdiction)}
													</Badge>
													<span className="text-xs text-muted-foreground">
														Trashed{" "}
														{new Date(policy.trashedAt).toLocaleDateString(
															"en-AU",
														)}
													</span>
												</div>
											</div>
										</div>
										<div className="mt-4 flex gap-2">
											<Button
												size="sm"
												variant="outline"
												className="text-green-600 hover:text-green-700"
												onClick={() => onRestorePolicy(policy.id, policy.title)}
											>
												<RefreshCw className="h-4 w-4 mr-1" />
												Restore
											</Button>
											<Button
												size="sm"
												variant="destructive"
												onClick={() =>
													onPermanentDelete(policy.id, policy.title)
												}
											>
												<Trash2 className="h-4 w-4 mr-1" />
												Delete Permanently
											</Button>
										</div>
									</CardContent>
								</Card>
							))}

							{trashedPolicies.length === 0 && (
								<div className="text-center py-12">
									<Trash2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
									<p className="text-muted-foreground">No policies in trash</p>
								</div>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
