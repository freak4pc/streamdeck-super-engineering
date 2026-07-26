import assert from "node:assert/strict";
import test from "node:test";

import { renderSessionImage } from "../src/sessions/session-image";
import type { SuperSession } from "../src/sessions/session";

test("session artwork bounds long titles and project names", () => {
	const markup = decodeSvg(renderSessionImage(session({
		displayName: "extraordinarilylongword followed by several more words",
		projectName: "A-Very-Long-Project",
	})));

	assert.doesNotMatch(markup, /extraordinarilylongword/);
	assert.match(markup, /extraordinari…/);
	assert.match(markup, /followed by…/);
	assert.match(markup, /A-VERY-L…/);
});

test("session artwork escapes XML and removes invalid control characters", () => {
	const markup = decodeSvg(renderSessionImage(session({
		displayName: "Fix <UI> & tests\u0001",
		projectName: "R&D",
	})));

	assert.match(markup, /Fix &lt;UI&gt;/);
	assert.match(markup, /&amp;/);
	assert.match(markup, />tests<\/text>/);
	assert.match(markup, /R&amp;D/);
	assert.doesNotMatch(markup, /\u0001/);
});

function decodeSvg(image: string): string {
	const prefix = "data:image/svg+xml;base64,";
	assert.ok(image.startsWith(prefix));
	return Buffer.from(image.slice(prefix.length), "base64").toString("utf8");
}

function session(overrides: Partial<SuperSession> = {}): SuperSession {
	return {
		agentSessions: [],
		agentState: "idle",
		branch: "main",
		deletions: 0,
		displayName: "Session",
		id: "project:worktree",
		insertions: 0,
		isPrimary: false,
		isSelected: false,
		path: "/tmp/worktree",
		projectName: "Project",
		state: "clean",
		...overrides,
	};
}
