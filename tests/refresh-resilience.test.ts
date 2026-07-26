import assert from "node:assert/strict";
import test from "node:test";

import { decideRefreshFailure } from "../src/sessions/refresh-resilience";

test("cached sessions survive transient refresh failures for five seconds", () => {
	const initial = decideRefreshFailure(true, false, undefined, 1_000);
	assert.deepEqual(initial, {
		deferError: true,
		failureStartedAt: 1_000,
		retryDelayMilliseconds: 1_000,
	});

	const stillTransient = decideRefreshFailure(true, false, initial.failureStartedAt, 5_999);
	assert.equal(stillTransient.deferError, true);

	const persistent = decideRefreshFailure(true, false, initial.failureStartedAt, 6_000);
	assert.deepEqual(persistent, {
		deferError: false,
		failureStartedAt: 1_000,
		retryDelayMilliseconds: 5_000,
	});
});

test("refresh failures surface immediately without cached sessions or after app termination", () => {
	assert.equal(decideRefreshFailure(false, false, undefined, 1_000).deferError, false);
	assert.equal(decideRefreshFailure(true, true, undefined, 1_000).deferError, false);
});
