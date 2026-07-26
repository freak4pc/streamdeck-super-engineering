import { readFile } from "node:fs/promises";

const packageMetadata = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(
	await readFile("com.freak4pc.super-engineering.sdPlugin/manifest.json", "utf8"),
);
const expectedManifestVersion = `${packageMetadata.version}.0`;

if (manifest.Version !== expectedManifestVersion) {
	throw new Error(
		`Manifest version ${manifest.Version} does not match package version ${packageMetadata.version}.`,
	);
}

const releaseTag = process.env.GITHUB_REF_TYPE === "tag"
	? process.env.GITHUB_REF_NAME
	: undefined;
if (releaseTag && releaseTag !== `v${packageMetadata.version}`) {
	throw new Error(
		`Release tag ${releaseTag} does not match package version ${packageMetadata.version}.`,
	);
}

console.log(`Release version ${packageMetadata.version} is consistent.`);
