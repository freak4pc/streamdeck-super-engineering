export type SessionState = "clean" | "dirty" | "unavailable";
export type AgentState = "attention" | "working" | "idle" | "none";
export type PullRequestCheckState = "failing" | "passing" | "pending" | "unknown";
export type PullRequestState = "closed" | "merged" | "open";

export type PullRequest = {
	checkState: PullRequestCheckState;
	number: number;
	state: PullRequestState;
};

export type AgentSession = {
	contextTokens?: number;
	contextWindow?: number;
	id: string;
	isActive: boolean;
	state: string;
	title: string;
};

export type SuperSession = {
	agentSessions: AgentSession[];
	agentState: AgentState;
	branch: string;
	deletions: number;
	displayName: string;
	id: string;
	insertions: number;
	isPrimary: boolean;
	isSelected: boolean;
	path: string;
	projectName: string;
	pullRequest?: PullRequest;
	state: SessionState;
};

export type SessionLoadResult = {
	errors: string[];
	sessions: SuperSession[];
};
