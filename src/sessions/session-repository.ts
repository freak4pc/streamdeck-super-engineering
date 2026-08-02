import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

import type { PluginConfiguration } from "../configuration";
import { execute } from "../lib/process";
import type {
	AgentSession,
	AgentState,
	PullRequest,
	PullRequestCheckState,
	PullRequestState,
	SessionLoadResult,
	SuperSession,
} from "./session";

export const MINIMUM_SC_API_VERSION = 21;

export type IntegrationErrorCode =
	| "sc-incompatible"
	| "sc-invalid"
	| "sc-missing"
	| "sc-offline"
	| "unknown";

export class IntegrationError extends Error {
	constructor(
		readonly code: IntegrationErrorCode,
		message: string,
	) {
		super(message);
		this.name = "IntegrationError";
	}
}

export type IntegrationHealth = {
	github: {
		message: string;
		state: "ready" | "unavailable";
	};
	sc: {
		apiVersion?: number;
		appVersion?: string;
		message: string;
		state: "incompatible" | "invalid" | "missing" | "offline" | "ready";
	};
};

export type WorkspaceWatchEvent = {
	selectedItemId?: string;
	type: string;
};

type PullRequestCacheEntry = {
	expiresAt: number;
	number: number;
	result: Promise<PullRequestCheckState>;
};

type ScHealthCache = {
	expiresAt: number;
	result: IntegrationHealth["sc"];
};

type WorkspaceListEnvelope = {
	response?: WorkspaceListResponse;
};

type WorkspaceListResponse = {
	active_workspace_id?: string;
	workspaces?: Workspace[];
};

type Workspace = {
	id?: string;
	sections?: WorkspaceSection[];
	selected?: boolean;
};

type WorkspaceSection = {
	items?: WorktreeItem[];
	kind?: string;
	projects?: ProjectGroup[];
};

type ProjectGroup = {
	items?: WorktreeItem[];
};

export type WorktreeItem = {
	agent_status?: string;
	attention?: unknown;
	branch?: string;
	diff?: WorktreeDiff | null;
	hidden_reason?: string;
	id?: string;
	is_primary?: boolean;
	path?: string;
	pr?: WorktreePullRequest | null;
	project_name?: string;
	selected?: boolean;
	sessions?: WorktreeAgentSession[];
	title?: string;
	visible?: boolean;
};

type WorktreeDiff = {
	additions?: number;
	deletions?: number;
};

type WorktreePullRequest = {
	number?: number;
	state?: string;
	url?: string;
};

type WorktreeAgentSession = {
	id?: string;
	is_active?: boolean;
	state?: string;
	title?: string;
	usage?: SessionUsage | null;
};

type SessionUsage = {
	context_tokens?: number;
	context_window?: number;
};

const HEALTH_CACHE_MILLISECONDS = 30_000;
const OFFLINE_HEALTH_CACHE_MILLISECONDS = 1_000;
const LIVE_PULL_REQUEST_CACHE_MILLISECONDS = 10_000;
const MAX_WATCH_BUFFER_CHARACTERS = 8 * 1_024 * 1_024;

export class SessionRepository {
	private githubPathPromise: Promise<string | undefined> | undefined;
	private readonly pullRequestCache = new Map<string, PullRequestCacheEntry>();
	private scHealthCache: ScHealthCache | undefined;

	constructor(private configuration: PluginConfiguration) {}

	setConfiguration(configuration: PluginConfiguration): void {
		if (configuration.ghPath !== this.configuration.ghPath) {
			this.githubPathPromise = undefined;
			this.pullRequestCache.clear();
		}
		if (configuration.scPath !== this.configuration.scPath) {
			this.scHealthCache = undefined;
		}
		this.configuration = configuration;
	}

	invalidateHealth(): void {
		this.scHealthCache = undefined;
	}

	async checkHealth(force = true): Promise<IntegrationHealth> {
		if (force) {
			this.githubPathPromise = undefined;
			this.pullRequestCache.clear();
		}
		const [sc, githubPath] = await Promise.all([
			this.loadScHealth(force),
			this.resolveGitHubPath(),
		]);

		let github: IntegrationHealth["github"];
		if (!githubPath) {
			github = {
				message: "Optional GitHub CLI not found; PR check colors are disabled.",
				state: "unavailable",
			};
		} else {
			try {
				await execute(githubPath, ["auth", "status"], { timeoutMilliseconds: 5_000 });
				github = {
					message: "GitHub CLI authenticated; PR check colors are enabled.",
					state: "ready",
				};
			} catch {
				github = {
					message: "GitHub CLI is not authenticated; PR check colors are disabled.",
					state: "unavailable",
				};
			}
		}

		return { github, sc };
	}

	async loadSessions(): Promise<SessionLoadResult> {
		const health = await this.loadScHealth(false);
		assertScHealth(health);

		const { stdout } = await execute(
			this.configuration.scPath,
			["workspace", "list", "--json"],
			{ timeoutMilliseconds: 10_000 },
		);
		const payload: unknown = parseJson(stdout, "sc workspace list");
		const items = extractVisibleItems(payload);
		const results = await Promise.allSettled(items.map((item) => this.makeSession(item)));
		const sessions: SuperSession[] = [];
		const errors: string[] = [];

		for (const result of results) {
			if (result.status === "fulfilled") {
				sessions.push(result.value);
			} else {
				errors.push(errorMessage(result.reason));
			}
		}

		if (items.length > 0 && sessions.length === 0) {
			throw new IntegrationError(
				"sc-invalid",
				`sc returned ${items.length} sidebar rows, but none could be read.`,
			);
		}

		return { errors, sessions };
	}

	watch(onChange: (event: WorkspaceWatchEvent) => void, onError: (error: Error) => void): () => void {
		const child = spawn(
			this.configuration.scPath,
			["workspace", "watch", "--json"],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		let buffer = "";
		let errorOutput = "";
		let failed = false;
		let stopped = false;
		const fail = (error: Error): void => {
			if (stopped || failed) {
				return;
			}
			failed = true;
			onError(error);
		};

		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			buffer += chunk;
			if (buffer.length > MAX_WATCH_BUFFER_CHARACTERS) {
				fail(new Error("workspace watch emitted an event larger than 8 MB"));
				return;
			}
			const lines = buffer.split(/\r?\n/);
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.trim()) {
					continue;
				}
				try {
					const payload: unknown = JSON.parse(line);
					onChange(parseWorkspaceWatchEvent(payload));
				} catch (error) {
					fail(new Error(`Invalid workspace watch event: ${errorMessage(error)}`));
					return;
				}
			}
		});

		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			errorOutput = `${errorOutput}${chunk}`.slice(-4_096);
		});

		child.on("error", (error) => {
			fail(error);
		});
		child.on("close", (code) => {
			fail(new Error(errorOutput.trim() || `workspace watch exited with code ${code ?? "unknown"}`));
		});

		return () => {
			stopped = true;
			child.kill("SIGTERM");
		};
	}

	async activate(session: SuperSession): Promise<void> {
		await execute(
			this.configuration.scPath,
			["worktree", "select", session.id, "--activate", "--json"],
			{ timeoutMilliseconds: 15_000 },
		);
	}

	async activateApplication(): Promise<void> {
		await execute("/usr/bin/open", ["-b", "com.zarifpour.superconductor"]);
	}

	async waitUntilReady(timeoutMilliseconds = 8_000): Promise<void> {
		const deadline = Date.now() + timeoutMilliseconds;
		let retryDelayMilliseconds = 100;

		while (true) {
			const health = await this.loadScHealth(true);
			if (health.state === "ready") {
				return;
			}
			if (health.state !== "offline" || Date.now() + retryDelayMilliseconds >= deadline) {
				assertScHealth(health);
			}

			await delay(retryDelayMilliseconds);
			retryDelayMilliseconds = Math.min(1_000, retryDelayMilliseconds * 2);
		}
	}

	async removeWorktree(session: SuperSession): Promise<void> {
		await execute(
			this.configuration.scPath,
			["worktree", "delete", session.id, "--json"],
			{ timeoutMilliseconds: 30_000 },
		);
		this.pullRequestCache.delete(session.path);
	}

	private async loadScHealth(force: boolean): Promise<IntegrationHealth["sc"]> {
		if (!force && this.scHealthCache && this.scHealthCache.expiresAt > Date.now()) {
			return this.scHealthCache.result;
		}

		let result: IntegrationHealth["sc"];
		try {
			await access(this.configuration.scPath, constants.X_OK);
		} catch {
			result = {
				message: `sc was not found at ${this.configuration.scPath}.`,
				state: "missing",
			};
			this.cacheScHealth(result);
			return result;
		}

		try {
			const { stdout } = await execute(
				this.configuration.scPath,
				["status", "--json"],
				{ timeoutMilliseconds: 5_000 },
			);
			const payload = parseJson(stdout, "sc status");
			if (!payload || typeof payload !== "object") {
				throw new Error("sc status returned an invalid payload");
			}
			const record = payload as Record<string, unknown>;
			const apiVersion = finiteNumberOrUndefined(record.api_version);
			const appVersion = typeof record.app_version === "string" ? record.app_version : undefined;

			if (record.ok !== true || apiVersion === undefined) {
				result = {
					message: "super.engineering returned an invalid status response.",
					state: "invalid",
				};
			} else if (apiVersion < MINIMUM_SC_API_VERSION) {
				result = {
					apiVersion,
					appVersion,
					message: `sc API v${apiVersion} is installed; v${MINIMUM_SC_API_VERSION} or newer is required.`,
					state: "incompatible",
				};
			} else {
				result = {
					apiVersion,
					appVersion,
					message: `Connected to super.engineering ${appVersion ?? ""} (API v${apiVersion}).`.replace("  ", " "),
					state: "ready",
				};
			}
		} catch (error) {
			result = error instanceof IntegrationError && error.code === "sc-invalid"
				? {
					message: error.message,
					state: "invalid",
				}
				: {
					message: `Open super.engineering to connect (${shortErrorMessage(error)}).`,
					state: "offline",
				};
		}

		this.cacheScHealth(result);
		return result;
	}

	private cacheScHealth(result: IntegrationHealth["sc"]): void {
		const cacheMilliseconds = result.state === "offline"
			? OFFLINE_HEALTH_CACHE_MILLISECONDS
			: HEALTH_CACHE_MILLISECONDS;
		this.scHealthCache = { expiresAt: Date.now() + cacheMilliseconds, result };
	}

	private async makeSession(item: WorktreeItem): Promise<SuperSession> {
		const id = requiredString(item.id, "worktree id");
		const worktreePath = requiredString(item.path, `path for ${id}`);
		const branch = requiredString(item.branch, `branch for ${id}`);
		const projectName = requiredString(item.project_name, `project name for ${id}`);
		const displayName = item.title?.trim() || branch;
		const agentSessions = parseAgentSessions(item.sessions);
		const diff = item.diff;
		const insertions = finiteNumber(diff?.additions);
		const deletions = finiteNumber(diff?.deletions);
		const pullRequest = await this.makePullRequest(item.pr, worktreePath);

		return {
			agentSessions,
			agentState: parseAgentState(item.agent_status, item.attention, agentSessions),
			branch,
			deletions,
			displayName,
			id,
			insertions,
			isPrimary: item.is_primary === true,
			isSelected: item.selected === true,
			path: worktreePath,
			projectName,
			pullRequest,
			state: diff
				? (insertions > 0 || deletions > 0 ? "dirty" : "clean")
				: "unavailable",
		};
	}

	private async makePullRequest(
		value: WorktreePullRequest | null | undefined,
		worktreePath: string,
	): Promise<PullRequest | undefined> {
		if (!value || typeof value.number !== "number") {
			return undefined;
		}

		const state = parsePullRequestState(value.state);
		const checkState = state === "open"
			? await this.inspectPullRequestChecks(worktreePath, value.number)
			: "unknown";

		return { checkState, number: value.number, state };
	}

	private inspectPullRequestChecks(worktreePath: string, number: number): Promise<PullRequestCheckState> {
		const cached = this.pullRequestCache.get(worktreePath);
		if (cached && cached.number === number && cached.expiresAt > Date.now()) {
			return cached.result;
		}

		const result = this.loadPullRequestChecks(worktreePath, number);
		this.pullRequestCache.set(worktreePath, {
			expiresAt: Date.now() + LIVE_PULL_REQUEST_CACHE_MILLISECONDS,
			number,
			result,
		});
		return result;
	}

	private async loadPullRequestChecks(
		worktreePath: string,
		number: number,
	): Promise<PullRequestCheckState> {
		const githubPath = await this.resolveGitHubPath();
		if (!githubPath) {
			return "unknown";
		}

		try {
			const { stdout } = await execute(
				githubPath,
				["pr", "view", String(number), "--json", "statusCheckRollup"],
				{ cwd: worktreePath, timeoutMilliseconds: 5_000 },
			);
			const payload: unknown = parseJson(stdout, "gh pr view");
			return payload && typeof payload === "object"
				? aggregateCheckState((payload as Record<string, unknown>).statusCheckRollup)
				: "unknown";
		} catch {
			return "unknown";
		}
	}

	private resolveGitHubPath(): Promise<string | undefined> {
		this.githubPathPromise ??= findExecutable(githubCandidates(this.configuration.ghPath));
		return this.githubPathPromise;
	}
}

export function parseWorkspaceWatchEvent(payload: unknown): WorkspaceWatchEvent {
	if (!payload || typeof payload !== "object") {
		return { type: "unknown" };
	}

	const record = payload as Record<string, unknown>;
	const type = typeof record.type === "string" ? record.type : "unknown";
	if (type === "selection" && typeof record.item_id === "string") {
		return { selectedItemId: record.item_id, type };
	}
	return { type };
}

export function extractVisibleItems(payload: unknown): WorktreeItem[] {
	if (!payload || typeof payload !== "object") {
		throw new IntegrationError("sc-invalid", "sc workspace list returned an invalid payload.");
	}

	const response = (payload as WorkspaceListEnvelope).response;
	if (!response || !Array.isArray(response.workspaces)) {
		throw new IntegrationError("sc-invalid", "sc workspace list did not include workspaces.");
	}

	const workspace = response.workspaces.find((candidate) => candidate.id === response.active_workspace_id)
		?? response.workspaces.find((candidate) => candidate.selected)
		?? response.workspaces[0];
	if (!workspace || !Array.isArray(workspace.sections)) {
		return [];
	}

	const items: WorktreeItem[] = [];
	for (const section of workspace.sections) {
		if (section.kind === "projects" && Array.isArray(section.projects)) {
			for (const project of section.projects) {
				if (Array.isArray(project.items)) {
					items.push(...project.items.filter(isVisibleItem));
				}
			}
		} else if (Array.isArray(section.items)) {
			items.push(...section.items.filter(isVisibleItem));
		}
	}

	return items;
}

function isVisibleItem(item: WorktreeItem): boolean {
	return item.visible !== false;
}

export function parseAgentSessions(value: WorktreeAgentSession[] | undefined): AgentSession[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.map((session, index) => ({
		contextTokens: optionalFiniteNumber(session.usage?.context_tokens),
		contextWindow: optionalFiniteNumber(session.usage?.context_window),
		id: session.id?.trim() || `session-${index}`,
		isActive: session.is_active === true,
		state: session.state?.trim() || "unknown",
		title: session.title?.trim() || "Agent session",
	}));
}

export function parseAgentState(
	status: string | undefined,
	attention: unknown,
	sessions: AgentSession[],
): AgentState {
	if (attention !== null && attention !== undefined && attention !== false && attention !== "") {
		return "attention";
	}

	const states = [status, ...sessions.map((session) => session.state)]
		.map((state) => String(state ?? "").toLowerCase());
	if (states.some((state) => [
		"attention",
		"awaiting_approval",
		"awaiting_user_input",
		"completion_candidate",
		"needs_attention",
		"permission",
		"review",
		"waiting",
	].includes(state))) {
		return "attention";
	}
	if (states.some((state) => ["running", "streaming", "working"].includes(state))) {
		return "working";
	}
	if (states.includes("idle") || sessions.length > 0) {
		return "idle";
	}
	return "none";
}

export function parsePullRequestState(value: string | undefined): PullRequestState {
	const state = String(value ?? "").toLowerCase();
	if (state === "merged") {
		return "merged";
	}
	return state === "closed" ? "closed" : "open";
}

export function aggregateCheckState(value: unknown): PullRequestCheckState {
	if (!Array.isArray(value) || value.length === 0) {
		return "unknown";
	}

	let hasPassingCheck = false;
	let hasPendingCheck = false;
	for (const item of value) {
		if (!item || typeof item !== "object") {
			continue;
		}

		const check = item as Record<string, unknown>;
		const state = String(check.state ?? "").toUpperCase();
		const status = String(check.status ?? "").toUpperCase();
		const conclusion = String(check.conclusion ?? "").toUpperCase();
		if (["ERROR", "FAILURE"].includes(state)
			|| ["ACTION_REQUIRED", "CANCELLED", "FAILURE", "STARTUP_FAILURE", "TIMED_OUT"].includes(conclusion)) {
			return "failing";
		}
		if (["EXPECTED", "PENDING"].includes(state) || (status && status !== "COMPLETED")) {
			hasPendingCheck = true;
			continue;
		}
		if (state === "SUCCESS" || ["NEUTRAL", "SKIPPED", "SUCCESS"].includes(conclusion)) {
			hasPassingCheck = true;
		}
	}

	if (hasPendingCheck) {
		return "pending";
	}
	return hasPassingCheck ? "passing" : "unknown";
}

function assertScHealth(health: IntegrationHealth["sc"]): void {
	switch (health.state) {
		case "ready":
			return;
		case "missing":
			throw new IntegrationError("sc-missing", health.message);
		case "offline":
			throw new IntegrationError("sc-offline", health.message);
		case "incompatible":
			throw new IntegrationError("sc-incompatible", health.message);
		case "invalid":
			throw new IntegrationError("sc-invalid", health.message);
	}
}

function githubCandidates(configuredPath: string): string[] {
	if (configuredPath) {
		return [configuredPath];
	}

	const pathCandidates = (process.env.PATH ?? "")
		.split(path.delimiter)
		.filter(Boolean)
		.map((directory) => path.join(directory, "gh"));
	return [
		"/opt/homebrew/bin/gh",
		"/usr/local/bin/gh",
		...pathCandidates,
	];
}

async function findExecutable(candidates: string[]): Promise<string | undefined> {
	for (const candidate of [...new Set(candidates)]) {
		try {
			await access(candidate, constants.X_OK);
			return candidate;
		} catch {
			// Try the next candidate.
		}
	}
	return undefined;
}

function parseJson(value: string, command: string): unknown {
	try {
		return JSON.parse(value);
	} catch (error) {
		throw new IntegrationError(
			"sc-invalid",
			`${command} returned invalid JSON: ${shortErrorMessage(error)}`,
		);
	}
}

function requiredString(value: string | undefined, label: string): string {
	if (!value?.trim()) {
		throw new Error(`sc workspace list omitted ${label}`);
	}
	return value;
}

function finiteNumber(value: number | undefined): number {
	return Number.isFinite(value) ? Number(value) : 0;
}

function finiteNumberOrUndefined(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalFiniteNumber(value: number | undefined): number | undefined {
	return Number.isFinite(value) ? Number(value) : undefined;
}

function shortErrorMessage(error: unknown): string {
	const message = errorMessage(error).replace(/\s+/g, " ").trim();
	return message.length <= 120 ? message : `${message.slice(0, 119)}…`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
