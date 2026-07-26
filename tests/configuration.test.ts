import assert from "node:assert/strict";
import os from "node:os";
import test from "node:test";

import { resolveConfiguration } from "../src/configuration";

test("resolveConfiguration expands sc home path and uses production defaults", () => {
	const configuration = resolveConfiguration();

	assert.equal(configuration.scPath, `${os.homedir()}/.superconductor/bin/sc`);
	assert.equal(configuration.ghPath, "");
	assert.equal(configuration.pollIntervalMilliseconds, 15_000);
});

test("resolveConfiguration clamps the fallback poll interval", () => {
	assert.equal(resolveConfiguration({ pollIntervalSeconds: 1 }).pollIntervalMilliseconds, 10_000);
	assert.equal(resolveConfiguration({ pollIntervalSeconds: 999 }).pollIntervalMilliseconds, 120_000);
	assert.equal(resolveConfiguration({ pollIntervalSeconds: Number.NaN }).pollIntervalMilliseconds, 15_000);
});

test("resolveConfiguration tolerates persisted strings and malformed settings", () => {
	const fromStrings = resolveConfiguration({
		ghPath: "  ~/bin/gh  ",
		pollIntervalSeconds: "25",
		scPath: "  ~/.superconductor/bin/sc  ",
	});

	assert.equal(fromStrings.ghPath, `${os.homedir()}/bin/gh`);
	assert.equal(fromStrings.pollIntervalMilliseconds, 25_000);
	assert.equal(fromStrings.scPath, `${os.homedir()}/.superconductor/bin/sc`);

	const malformed = resolveConfiguration({
		ghPath: { path: "/tmp/gh" },
		pollIntervalSeconds: Symbol("invalid"),
		scPath: 42,
	} as unknown as Parameters<typeof resolveConfiguration>[0]);
	assert.equal(malformed.ghPath, "");
	assert.equal(malformed.pollIntervalMilliseconds, 15_000);
	assert.equal(malformed.scPath, `${os.homedir()}/.superconductor/bin/sc`);
});
