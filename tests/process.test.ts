import assert from "node:assert/strict";
import test from "node:test";

import { execute } from "../src/lib/process";

test("command failures include their exit code", async () => {
	await assert.rejects(
		execute("/usr/bin/false", []),
		(error: Error) => {
			assert.match(error.message, /code=1/);
			return true;
		},
	);
});
