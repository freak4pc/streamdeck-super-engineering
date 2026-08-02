import assert from "node:assert/strict";
import test from "node:test";

import {
	aggregateCheckState,
	extractVisibleItems,
	parseAgentState,
	parsePullRequestState,
	parseWorkspaceWatchEvent,
} from "../src/sessions/session-repository";

test("workspace watch preserves selection event payloads", () => {
	assert.deepEqual(
		parseWorkspaceWatchEvent({
			item_id: "workspace:project:worktree",
			revision: 42,
			type: "selection",
		}),
		{ selectedItemId: "workspace:project:worktree", type: "selection" },
	);
	assert.deepEqual(parseWorkspaceWatchEvent({ type: "delta" }), { type: "delta" });
	assert.deepEqual(parseWorkspaceWatchEvent(null), { type: "unknown" });
});

test("workspace rows preserve the active sidebar's section and project order", () => {
	const items = extractVisibleItems({
		response: {
			active_workspace_id: "active",
			workspaces: [
				{
					id: "other",
					sections: [{ items: [{ id: "wrong", visible: true }] }],
				},
				{
					id: "active",
					sections: [
						{
							kind: "projects",
							projects: [
								{
									items: [
										{ id: "ios-main", title: "main", visible: true },
										{ id: "ios-hidden", title: "hidden", visible: false },
										{ id: "ios-feature", title: "Feature", visible: true },
									],
								},
								{
									items: [{ id: "harbor-main", title: "main", visible: true }],
								},
							],
						},
						{
							kind: "manual",
							items: [{ id: "manual", title: "Manual", visible: true }],
						},
					],
				},
			],
		},
	});

	assert.deepEqual(
		items.map((item) => item.id),
		["ios-main", "ios-feature", "harbor-main", "manual"],
	);
	assert.deepEqual(
		items.map((item) => item.title),
		["main", "Feature", "main", "Manual"],
	);
});

test("agent attention always wins over an idle label", () => {
	assert.equal(parseAgentState("idle", { reason: "review" }, []), "attention");
	assert.equal(parseAgentState("waiting", null, []), "attention");
	assert.equal(parseAgentState("idle", null, []), "idle");
	assert.equal(parseAgentState("working", null, []), "working");
});

test("pull request lifecycle state is normalized", () => {
	assert.equal(parsePullRequestState("MERGED"), "merged");
	assert.equal(parsePullRequestState("closed"), "closed");
	assert.equal(parsePullRequestState("OPEN"), "open");
	assert.equal(parsePullRequestState(undefined), "open");
});

test("GitHub check rollups prioritize failures, then pending checks", () => {
	assert.equal(aggregateCheckState([]), "unknown");
	assert.equal(aggregateCheckState([{ state: "SUCCESS" }]), "passing");
	assert.equal(
		aggregateCheckState([{ state: "SUCCESS" }, { status: "IN_PROGRESS" }]),
		"pending",
	);
	assert.equal(
		aggregateCheckState([{ status: "IN_PROGRESS" }, { conclusion: "FAILURE" }]),
		"failing",
	);
});
