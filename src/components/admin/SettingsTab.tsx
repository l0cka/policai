import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const aiSettings = [
	{
		name: "OPENROUTER_API_KEY",
		required: "Required for AI",
		description:
			"Powers discovery, scraping analysis, verification, and implementation drafts.",
	},
	{
		name: "AI_MODEL",
		required: "Optional",
		description:
			"Overrides the default OpenRouter model. Defaults to openrouter/auto.",
	},
];

const dataSettings = [
	{
		name: "NEXT_PUBLIC_SUPABASE_URL",
		required: "Optional",
		description:
			"Supabase project URL. Without it, the app reads and writes local JSON fallback files.",
	},
	{
		name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
		required: "Optional",
		description: "Public Supabase anon key for client-side reads and auth.",
	},
	{
		name: "SUPABASE_SERVICE_ROLE_KEY",
		required: "Server-only",
		description:
			"Required for protected admin and cron writes when Supabase RLS is enabled.",
	},
];

export function SettingsTab() {
	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>AI Configuration</CardTitle>
					<CardDescription>
						AI settings are managed through environment variables, not saved
						from the browser.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{aiSettings.map((setting, index) => (
						<ConfigRow
							key={setting.name}
							setting={setting}
							showSeparator={index < aiSettings.length - 1}
						/>
					))}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Data Storage</CardTitle>
					<CardDescription>
						Supabase is optional. Local development falls back to JSON files in
						public/data/ and data/.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{dataSettings.map((setting, index) => (
						<ConfigRow
							key={setting.name}
							setting={setting}
							showSeparator={index < dataSettings.length - 1}
						/>
					))}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>How to Change Settings</CardTitle>
					<CardDescription>
						Update configuration outside the admin UI.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
						<li>
							Edit <code className="font-mono text-foreground">.env.local</code>{" "}
							for local development or the deployment environment for
							production.
						</li>
						<li>
							Restart the Next.js process so server-side modules read the new
							values.
						</li>
						<li>
							Run{" "}
							<code className="font-mono text-foreground">
								npm run lint && npm run test && npm run build
							</code>{" "}
							before deploying configuration-related changes.
						</li>
					</ol>
				</CardContent>
			</Card>
		</div>
	);
}

function ConfigRow({
	setting,
	showSeparator,
}: {
	setting: { name: string; required: string; description: string };
	showSeparator: boolean;
}) {
	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-1">
					<div className="font-mono text-sm font-medium">{setting.name}</div>
					<p className="text-sm text-muted-foreground">{setting.description}</p>
				</div>
				<Badge variant="outline" className="w-fit shrink-0">
					{setting.required}
				</Badge>
			</div>
			{showSeparator && <Separator />}
		</div>
	);
}
