import os from "node:os";
import path from "node:path";

export type PluginSettings = {
	ghPath?: string | null;
	pollIntervalSeconds?: number | string | null;
	scPath?: string | null;
};

export type PluginConfiguration = {
	ghPath: string;
	pollIntervalMilliseconds: number;
	scPath: string;
};

export function resolveConfiguration(settings: PluginSettings = {}): PluginConfiguration {
	const requestedPollInterval = numberValue(settings.pollIntervalSeconds) ?? 15;
	const pollIntervalSeconds = Number.isFinite(requestedPollInterval)
		? Math.min(120, Math.max(10, requestedPollInterval))
		: 15;
	const configuredGitHubPath = stringValue(settings.ghPath);
	const configuredScPath = stringValue(settings.scPath);

	return {
		ghPath: configuredGitHubPath ? expandHome(configuredGitHubPath) : "",
		pollIntervalMilliseconds: pollIntervalSeconds * 1_000,
		scPath: expandHome(configuredScPath || "~/.superconductor/bin/sc"),
	};
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : undefined;
	}
	if (typeof value !== "string" || !value.trim()) {
		return undefined;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function expandHome(value: string): string {
	if (value === "~") {
		return os.homedir();
	}

	if (value.startsWith("~/")) {
		return path.join(os.homedir(), value.slice(2));
	}

	return path.resolve(value);
}
