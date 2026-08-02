import assert from "node:assert/strict";
import test from "node:test";

import type { SuperSession } from "../src/sessions/session";
import { updateSelectedSession } from "../src/sessions/session-selection";

test("selection events move the marker to the selected session", () => {
	const sessions = [session("first", true), session("second", false)];

	assert.equal(updateSelectedSession(sessions, "second"), true);
	assert.deepEqual(sessions.map(({ isSelected }) => isSelected), [false, true]);
	assert.equal(updateSelectedSession(sessions, "second"), false);
});

test("selection events clear the marker when the selected session is not visible", () => {
	const sessions = [session("first", true), session("second", false)];

	assert.equal(updateSelectedSession(sessions, "hidden"), true);
	assert.deepEqual(sessions.map(({ isSelected }) => isSelected), [false, false]);
});

function session(id: string, isSelected: boolean): SuperSession {
	return {
		agentSessions: [],
		agentState: "idle",
		branch: "main",
		deletions: 0,
		displayName: id,
		id,
		insertions: 0,
		isPrimary: false,
		isSelected,
		path: `/tmp/${id}`,
		projectName: "Project",
		state: "clean",
	};
}
