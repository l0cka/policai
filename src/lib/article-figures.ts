import { isValidCalendarDate } from "@/lib/calendar-date";
import { parseFrontmatter } from "@/lib/frontmatter";
import { sourceUrlsEqual } from "@/lib/source-url";
import {
	CHART_GROUPS,
	FIGURE_KINDS,
	FLOW_STEP_ROLES,
	JURISDICTIONS,
	JURISDICTION_NAMES,
	POLICY_STATUSES,
	POLICY_STATUS_NAMES,
	POLICY_TYPES,
	POLICY_TYPE_NAMES,
	type ArticleBlock,
	type ArticleFigure,
	type ChartFigure,
	type ChartGroup,
	type ChartWhere,
	type DatePrecision,
	type FlowBranch,
	type FlowStep,
	type MatrixCell,
	type MatrixRow,
	type Policy,
	type TimelineEntry,
} from "@/types";

const FIGURE_LIMITS = {
	titleMax: 100,
	altMin: 20,
	timeline: { min: 2, max: 7 },
	matrixColumns: { min: 2, max: 5 },
	matrixRows: { min: 2, max: 9 },
	flowSteps: { min: 3, max: 6 },
	chartBars: { min: 3, max: 10 },
} as const;

const FRAME_FIELDS = ["kind", "title", "alt", "caption", "cites", "sources", "wide"];

const KIND_FIELDS: Record<ArticleFigure["kind"], string[]> = {
	timeline: ["asAt", "entries"],
	matrix: ["columns", "rows"],
	flow: ["steps", "branch"],
	chart: ["group", "where", "highlight"],
};

const CHART_VALUES: { [G in ChartGroup]: readonly Policy[G][] } = {
	jurisdiction: JURISDICTIONS,
	type: POLICY_TYPES,
	status: POLICY_STATUSES,
};

const CHART_LABELS: { [G in ChartGroup]: Record<Policy[G], string> } = {
	jurisdiction: JURISDICTION_NAMES,
	type: POLICY_TYPE_NAMES,
	status: POLICY_STATUS_NAMES,
};

const FIGURE_OPEN = /^```figure\s*$/;
const FIGURE_CLOSE = /^```\s*$/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const REFERENCE_DEFINITION = /^ {0,3}\[[^\]]+\]:\s*\S+.*$/;

type Data = Record<string, unknown>;

interface FigureContext {
	cites: readonly string[];
	sources: readonly string[];
}

type RawBlock =
	| { kind: "prose"; lines: string[] }
	| { kind: "figure"; number: number; lines: string[] };

interface ArticleBodyBlocks {
	blocks: ArticleBlock[];
	errors: string[];
}

function scanBody(body: string): { raw: RawBlock[]; errors: string[]; definitions: string[] } {
	const raw: RawBlock[] = [];
	const definitions: string[] = [];
	let prose: string[] = [];
	let figure: { number: number; lines: string[] } | null = null;
	let fence: { char: string; length: number } | null = null;
	let count = 0;

	for (const line of body.split("\n")) {
		if (figure) {
			if (FIGURE_CLOSE.test(line)) {
				raw.push({ kind: "figure", ...figure });
				figure = null;
			} else {
				figure.lines.push(line);
			}
			continue;
		}
		if (fence) {
			const close = new RegExp(`^ {0,3}${fence.char === "`" ? "`" : "~"}{${fence.length},}\\s*$`);
			if (close.test(line)) fence = null;
			prose.push(line);
			continue;
		}
		if (FIGURE_OPEN.test(line)) {
			raw.push({ kind: "prose", lines: prose });
			prose = [];
			count += 1;
			figure = { number: count, lines: [] };
			continue;
		}
		const open = FENCE_OPEN.exec(line);
		if (open) fence = { char: open[1][0], length: open[1].length };
		else if (REFERENCE_DEFINITION.test(line)) definitions.push(line.trim());
		prose.push(line);
	}
	raw.push({ kind: "prose", lines: prose });
	const errors = figure ? [`figure ${figure.number} is not closed with \`\`\``] : [];
	return { raw, errors, definitions };
}

function withDefinitions(markdown: string, definitions: readonly string[]): string {
	const missing = definitions.filter((definition) => !markdown.includes(definition));
	return missing.length > 0 ? `${markdown}\n\n${missing.join("\n")}` : markdown;
}

export function parseArticleBody(body: string, context: FigureContext): ArticleBodyBlocks {
	const { raw, errors, definitions } = scanBody(body);
	const hasFigures = raw.some((block) => block.kind === "figure");
	const blocks: ArticleBlock[] = [];
	for (const block of raw) {
		if (block.kind === "prose") {
			const markdown = block.lines.join("\n").trim();
			if (markdown) {
				blocks.push({
					kind: "prose",
					markdown: hasFigures ? withDefinitions(markdown, definitions) : markdown,
				});
			}
			continue;
		}
		const result = parseFigure(block.lines.join("\n"), context);
		errors.push(...result.errors.map((error) => `figure ${block.number}: ${error}`));
		if (result.figure) blocks.push({ kind: "figure", number: block.number, figure: result.figure });
	}
	return { blocks, errors };
}

function isRecord(value: unknown): value is Data {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOrMany(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [value];
}

function calendarDay(value: unknown): string | undefined {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
	return typeof value === "string" && isValidCalendarDate(value) ? value : undefined;
}

function timelineDate(value: unknown): { date: string; precision: DatePrecision } | undefined {
	const day = calendarDay(value);
	if (day) return { date: day, precision: "day" };
	const text = typeof value === "number" ? String(value) : value;
	if (typeof text !== "string") return undefined;
	if (/^\d{4}-\d{2}$/.test(text) && isValidCalendarDate(`${text}-01`)) {
		return { date: `${text}-01`, precision: "month" };
	}
	if (/^\d{4}$/.test(text)) return { date: `${text}-01-01`, precision: "year" };
	return undefined;
}

function parseFigure(
	yaml: string,
	context: FigureContext,
): { figure?: ArticleFigure; errors: string[] } {
	let data: Data;
	try {
		const parsed = parseFrontmatter(`---\n${yaml}\n---\n`).data;
		data = isRecord(parsed) ? parsed : {};
	} catch (error) {
		return { errors: [`is not valid YAML (${(error as Error).message})`] };
	}
	const errors: string[] = [];
	const text = (value: unknown): string | undefined =>
		typeof value === "string" && value.trim() ? value.trim() : undefined;
	const required = (key: string): string | undefined => {
		const value = text(data[key]);
		if (!value) errors.push(`${key} is required`);
		return value;
	};
	const list = (key: string): string[] => {
		const value = data[key];
		if (value === undefined) return [];
		if (!Array.isArray(value) || !value.every((item) => text(item))) {
			errors.push(`${key} must be a list of non-empty text`);
			return [];
		}
		const items = value.map((item: string) => item.trim());
		if (new Set(items).size !== items.length) errors.push(`${key} must not repeat an entry`);
		return items;
	};

	const kind = FIGURE_KINDS.find((candidate) => candidate === data.kind);
	if (!kind) {
		return { errors: [`kind must be one of ${FIGURE_KINDS.join(", ")}`] };
	}
	const known = new Set([...FRAME_FIELDS, ...KIND_FIELDS[kind]]);
	for (const key of Object.keys(data)) {
		if (!known.has(key)) errors.push(`unknown field "${key}"`);
	}

	const title = required("title");
	if (title && title.length > FIGURE_LIMITS.titleMax) {
		errors.push(`title must be at most ${FIGURE_LIMITS.titleMax} characters`);
	}
	const alt = required("alt");
	if (alt && alt.length < FIGURE_LIMITS.altMin) {
		errors.push(`alt must be at least ${FIGURE_LIMITS.altMin} characters`);
	}
	const caption = required("caption");
	const cites = list("cites");
	const sources = list("sources");
	for (const id of cites) {
		if (!context.cites.includes(id)) errors.push(`cites ${id}, which the piece's cites do not`);
	}
	for (const url of sources) {
		const listed = context.sources.some((source) => {
			try {
				return sourceUrlsEqual(source, url);
			} catch {
				return false;
			}
		});
		if (!listed) errors.push(`sources lists ${url}, which the piece's sources do not`);
	}
	if (data.wide !== undefined && kind !== "matrix" && kind !== "flow") {
		errors.push("wide is only for a matrix or a flow");
	} else if (data.wide !== undefined && typeof data.wide !== "boolean") {
		errors.push("wide must be true or false");
	}
	const wide = data.wide === true;
	if (kind === "chart" && data.cites !== undefined) {
		errors.push("a chart counts the public register as a whole and lists no cites");
	}

	const frame = { title: title ?? "", alt: alt ?? "", caption: caption ?? "", sources };
	let figure: ArticleFigure | undefined;
	if (kind === "timeline") {
		const parts = parseTimeline(data, errors);
		if (parts) figure = { kind, ...frame, cites, ...parts };
	} else if (kind === "matrix") {
		const parts = parseMatrix(data, errors);
		if (parts) figure = { kind, ...frame, cites, wide, ...parts };
	} else if (kind === "flow") {
		const parts = parseFlow(data, errors);
		if (parts) figure = { kind, ...frame, cites, wide, ...parts };
	} else {
		const parts = parseChart(data, errors);
		if (parts) figure = { kind, ...frame, ...parts };
	}
	return errors.length > 0 ? { errors } : { figure, errors };
}

function countError(
	length: number,
	limits: { min: number; max: number },
	message: string,
	errors: string[],
): boolean {
	if (length >= limits.min && length <= limits.max) return false;
	errors.push(message);
	return true;
}

function parseTimeline(
	data: Data,
	errors: string[],
): { asAt: string; entries: TimelineEntry[] } | undefined {
	const asAt = calendarDay(data.asAt);
	if (!asAt) errors.push("asAt is required and must be a calendar date (YYYY-MM-DD)");
	const raw = Array.isArray(data.entries) ? data.entries : [];
	const { min, max } = FIGURE_LIMITS.timeline;
	if (countError(raw.length, FIGURE_LIMITS.timeline, `a timeline needs ${min} to ${max} entries`, errors)) {
		return undefined;
	}
	const entries: TimelineEntry[] = [];
	raw.forEach((item: unknown, index) => {
		const entry = isRecord(item) ? item : {};
		const date = timelineDate(entry.date);
		const title = typeof entry.title === "string" ? entry.title.trim() : "";
		const detail = typeof entry.detail === "string" ? entry.detail.trim() : undefined;
		for (const key of Object.keys(entry)) {
			if (!["date", "title", "detail"].includes(key)) {
				errors.push(`entries[${index}] has unknown field "${key}"`);
			}
		}
		if (!date || !title) {
			errors.push(`entries[${index}] needs a date (YYYY-MM-DD, YYYY-MM or YYYY) and a title`);
			return;
		}
		entries.push({ ...date, title, ...(detail ? { detail } : {}) });
	});
	if (entries.some((entry, index) => index > 0 && entry.date < entries[index - 1].date)) {
		errors.push("timeline entries must be in date order");
	}
	return asAt ? { asAt, entries } : undefined;
}

function parseMatrixCell(value: unknown, label: string, errors: string[]): MatrixCell | undefined {
	if (value === null) return { kind: "not_stated" };
	if (typeof value === "string" || typeof value === "number") {
		const text = String(value).trim();
		if (text) return { kind: "text", text, emphasis: false };
		errors.push(`${label} is empty; write ~ for Not stated`);
		return undefined;
	}
	if (isRecord(value) && typeof value.text === "string" && value.text.trim()) {
		const extra = Object.keys(value).filter((key) => key !== "text" && key !== "emphasis");
		if (extra.length === 0 && (value.emphasis === undefined || typeof value.emphasis === "boolean")) {
			return { kind: "text", text: value.text.trim(), emphasis: value.emphasis === true };
		}
	}
	errors.push(`${label} must be text, ~ (Not stated) or { text, emphasis: true }`);
	return undefined;
}

function parseMatrix(data: Data, errors: string[]): { columns: string[]; rows: MatrixRow[] } | undefined {
	const columns = Array.isArray(data.columns)
		? data.columns.map((column: unknown) => (typeof column === "string" ? column.trim() : ""))
		: [];
	const rawRows = Array.isArray(data.rows) ? data.rows : [];
	const columnLimits = FIGURE_LIMITS.matrixColumns;
	const rowLimits = FIGURE_LIMITS.matrixRows;
	const badColumns = countError(columns.length, columnLimits, `a matrix needs ${columnLimits.min} to ${columnLimits.max} columns`, errors);
	const badRows = countError(rawRows.length, rowLimits, `a matrix needs ${rowLimits.min} to ${rowLimits.max} rows`, errors);
	if (badColumns || badRows) return undefined;
	if (columns.some((column) => !column)) errors.push("columns must be non-empty text");
	const rows: MatrixRow[] = [];
	rawRows.forEach((raw: unknown, index) => {
		if (!Array.isArray(raw) || raw.length !== columns.length) {
			errors.push(`rows[${index}] must list ${columns.length} cells, one per column`);
			return;
		}
		const header = typeof raw[0] === "string" ? raw[0].trim() : "";
		if (!header) errors.push(`rows[${index}] needs its first cell as text`);
		const cells = raw
			.slice(1)
			.map((value: unknown, cell) => parseMatrixCell(value, `rows[${index}] cell ${cell + 2}`, errors));
		if (cells.filter((cell) => cell?.kind === "text" && cell.emphasis).length > 1) {
			errors.push(`rows[${index}] can emphasise at most one cell`);
		}
		if (header && cells.every((cell): cell is MatrixCell => cell !== undefined)) rows.push({ header, cells });
	});
	return { columns, rows };
}

function parseFlowSteps(raw: unknown, label: string, errors: string[]): FlowStep[] {
	if (!Array.isArray(raw)) {
		errors.push(`${label} must be a list of steps`);
		return [];
	}
	return raw.flatMap((item: unknown, index) => {
		const step = isRecord(item) ? item : {};
		const text = typeof step.text === "string" ? step.text.trim() : "";
		const role = step.role === undefined ? "step" : FLOW_STEP_ROLES.find((candidate) => candidate === step.role);
		const stepLabel = typeof step.label === "string" ? step.label.trim() : undefined;
		const extra = Object.keys(step).filter((key) => !["text", "role", "label"].includes(key));
		if (!text || !role || extra.length > 0 || (step.label !== undefined && !stepLabel)) {
			errors.push(`${label}[${index}] needs text, an optional role (${FLOW_STEP_ROLES.join(", ")}) and an optional label`);
			return [];
		}
		return [{ text, role, ...(stepLabel ? { label: stepLabel } : {}) }];
	});
}

function parseFlow(data: Data, errors: string[]): { steps: FlowStep[]; branch?: FlowBranch } | undefined {
	const steps = parseFlowSteps(data.steps, "steps", errors);
	let branch: FlowBranch | undefined;
	if (data.branch !== undefined) {
		const raw = data.branch;
		if (!isRecord(raw)) {
			errors.push("branch must be one { from, label, steps }; a flow has at most one branch");
			return undefined;
		}
		const label = typeof raw.label === "string" ? raw.label.trim() : "";
		if (!label) errors.push("branch.label is required");
		const from = raw.from;
		if (typeof from !== "number" || steps[from - 1]?.role !== "decision") {
			errors.push("branch.from must be the number of a decision step");
		}
		const branchSteps = parseFlowSteps(raw.steps, "branch.steps", errors);
		if (branchSteps.length === 0) errors.push("branch.steps needs at least one step");
		if (typeof from === "number") branch = { from, label, steps: branchSteps };
	}
	const { min, max } = FIGURE_LIMITS.flowSteps;
	const total = steps.length + (branch?.steps.length ?? 0);
	if (countError(total, FIGURE_LIMITS.flowSteps, `a flow needs ${min} to ${max} steps, counting its branch`, errors)) {
		return undefined;
	}
	return { steps, ...(branch ? { branch } : {}) };
}

function parseChart(data: Data, errors: string[]): Pick<ChartFigure, "query" | "highlight"> | undefined {
	const group = CHART_GROUPS.find((candidate) => candidate === data.group);
	if (!group) {
		errors.push(`group must be one of ${CHART_GROUPS.join(", ")}`);
		return undefined;
	}
	const where: ChartWhere = {};
	if (data.where !== undefined && !isRecord(data.where)) {
		errors.push("where must map query fields to values");
	}
	const rawWhere = isRecord(data.where) ? data.where : {};
	for (const [key, value] of Object.entries(rawWhere)) {
		if (key === "effectiveDate") {
			const range = isRecord(value) ? value : {};
			const from = range.from === undefined ? undefined : calendarDay(range.from);
			const to = range.to === undefined ? undefined : calendarDay(range.to);
			const extra = Object.keys(range).filter((field) => field !== "from" && field !== "to");
			if (!isRecord(value) || extra.length > 0 || (range.from !== undefined && !from) || (range.to !== undefined && !to) || (!from && !to)) {
				errors.push("where.effectiveDate must be { from, to } with calendar dates");
			} else if (from && to && from > to) {
				errors.push("where.effectiveDate.from must not be after to");
			} else {
				where.effectiveDate = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
			}
			continue;
		}
		const field = CHART_GROUPS.find((candidate) => candidate === key);
		if (!field) {
			errors.push(`where.${key} is not a query field; use ${CHART_GROUPS.join(", ")} or effectiveDate`);
			continue;
		}
		const allowed: readonly string[] = CHART_VALUES[field];
		const values = oneOrMany(value);
		const unknown = values.filter((item) => typeof item !== "string" || !allowed.includes(item));
		if (unknown.length > 0) {
			errors.push(`where.${key} has unknown value ${unknown.map(String).join(", ")}`);
			continue;
		}
		Object.assign(where, { [field]: values });
	}
	const highlight = data.highlight;
	if (highlight !== undefined && (typeof highlight !== "string" || !(CHART_VALUES[group] as readonly string[]).includes(highlight))) {
		errors.push(`highlight must be a ${group} value`);
		return undefined;
	}
	return { query: { group, where }, ...(typeof highlight === "string" ? { highlight } : {}) };
}

export interface RegisterChartBar {
	value: string;
	label: string;
	count: number;
	highlighted: boolean;
}

export interface RegisterChart {
	total: number;
	bars: RegisterChartBar[];
}

function calendarText(value: Date | string): string {
	return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function matchesWhere(policy: Policy, where: ChartWhere): boolean {
	if (where.jurisdiction && !where.jurisdiction.includes(policy.jurisdiction)) return false;
	if (where.type && !where.type.includes(policy.type)) return false;
	if (where.status && !where.status.includes(policy.status)) return false;
	const effective = calendarText(policy.effectiveDate);
	if (where.effectiveDate?.from && effective < where.effectiveDate.from) return false;
	if (where.effectiveDate?.to && effective > where.effectiveDate.to) return false;
	return true;
}

export function registerChart(chart: ChartFigure, publicPolicies: readonly Policy[]): RegisterChart {
	const { group, where } = chart.query;
	const counted = publicPolicies.filter((policy) => matchesWhere(policy, where));
	const order: readonly string[] = CHART_VALUES[group];
	const labels: Record<string, string> = CHART_LABELS[group];
	const counts = new Map<string, number>();
	for (const policy of counted) counts.set(policy[group], (counts.get(policy[group]) ?? 0) + 1);
	const bars = order
		.filter((value) => counts.has(value))
		.map((value) => ({
			value,
			label: labels[value],
			count: counts.get(value) ?? 0,
			highlighted: value === chart.highlight,
		}));
	if (group !== "status") bars.sort((a, b) => b.count - a.count);
	return { total: counted.length, bars };
}

export function registerChartErrors(chart: ChartFigure, publicPolicies: readonly Policy[]): string[] {
	const { total, bars } = registerChart(chart, publicPolicies);
	if (total === 0) return ["the register query matches no public record"];
	const errors: string[] = [];
	const { min, max } = FIGURE_LIMITS.chartBars;
	if (bars.length < min || bars.length > max) {
		errors.push(`a chart needs ${min} to ${max} bars; the register query gives ${bars.length}`);
	}
	if (chart.highlight && !bars.some((bar) => bar.highlighted)) {
		errors.push(`highlight ${chart.highlight} has no public records in the query`);
	}
	return errors;
}
