import assert from "node:assert/strict";
import test from "node:test";

import {
	clampPage,
	orderPositionedActions,
	sessionIndex,
	totalPages,
	wrappedPage,
} from "../src/sessions/session-pagination";

test("visible slots follow row-major visual order without assuming device width", () => {
	const ordered = orderPositionedActions([
		{ actionId: "bottom-right", column: 7, row: 3 },
		{ actionId: "top-middle", column: 3, row: 0 },
		{ actionId: "bottom-left", column: 0, row: 3 },
		{ actionId: "top-left", column: 0, row: 0 },
	]);

	assert.deepEqual(
		ordered.map((item) => item.actionId),
		["top-left", "top-middle", "bottom-left", "bottom-right"],
	);
});

test("pagination adapts to Mini, Neo, standard, and XL slot counts", () => {
	assert.equal(totalPages(12, 5), 3);
	assert.equal(totalPages(12, 7), 2);
	assert.equal(totalPages(12, 14), 1);
	assert.equal(totalPages(40, 30), 2);
	assert.equal(totalPages(0, 0), 1);
});

test("page and session indices remain in range as sessions disappear", () => {
	assert.equal(clampPage(4, 17, 7), 2);
	assert.equal(clampPage(2, 3, 7), 0);
	assert.equal(clampPage(-2, 17, 7), 0);
	assert.equal(sessionIndex(2, 7, 3), 17);
});

test("navigation wraps in either direction", () => {
	assert.equal(wrappedPage(0, -1, 12, 5), 2);
	assert.equal(wrappedPage(2, 1, 12, 5), 0);
	assert.equal(wrappedPage(0, 1, 3, 5), 0);
});
