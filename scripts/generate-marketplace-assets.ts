import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
	renderDeleteConfirmationImage,
	renderSessionImage,
} from "../src/sessions/session-image";
import type { AgentState, PullRequest, SuperSession } from "../src/sessions/session";

const WIDTH = 1_920;
const HEIGHT = 960;
const outputDirectory = path.resolve("marketplace/media");
const sourceDirectory = path.join(outputDirectory, "sources");
const converter = [
	"/opt/homebrew/bin/rsvg-convert",
	"/usr/local/bin/rsvg-convert",
].find(existsSync);

if (!converter) {
	throw new Error("rsvg-convert is required to generate Marketplace PNG assets.");
}

await mkdir(sourceDirectory, { recursive: true });

const appIcon = dataUrl(await readFile("marketplace/media/app-icon.png"), "image/png");

const sessions = [
	session("main", "APP", "idle", 0, 0, true),
	session("Checkout refactor", "WEB", "working", 142, 18),
	session("API rate limits", "BACKEND", "attention", 36, 4, false, {
		checkState: "pending",
		number: 248,
		state: "open",
	}),
	session("Design tokens", "UI", "idle", 91, 12, false, {
		checkState: "unknown",
		number: 241,
		state: "merged",
	}),
	session("Release prep", "APP", "idle", 8, 2, false, {
		checkState: "passing",
		number: 251,
		state: "open",
	}),
	session("Onboarding flow", "WEB", "attention", 27, 5),
	session("Audio pipeline", "MEDIA", "working", 316, 44),
	session("Search indexing", "API", "idle", 12, 1),
];
const sessionImages = sessions.map((value) => renderSessionImage(value));

// The app icon, Marketplace thumbnail, and GitHub social preview use curated campaign artwork.
// Derive the README crop without modifying that source, then generate reproducible screenshots.
await generateReadmeIcon();
await generate("gallery-live-grid", liveGridSvg());
await generate("gallery-device-layouts", deviceLayoutsSvg());
await generate("gallery-session-states", sessionStatesSvg());

async function generateReadmeIcon(): Promise<void> {
	const width = 288;
	const height = 216;
	const source = path.join(sourceDirectory, "readme-icon.svg");
	const output = path.join(outputDirectory, "readme-icon.png");
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
		<defs>
			<clipPath id="rounded">
				<rect width="${width}" height="${height}" rx="34"/>
			</clipPath>
		</defs>
		<image href="${appIcon}" x="0" y="-36" width="288" height="288" clip-path="url(#rounded)"/>
	</svg>`;
	await writeFile(source, svg, "utf8");
	execFileSync(converter!, [
		"-w",
		String(width),
		"-h",
		String(height),
		"-o",
		output,
		source,
	]);
}

function liveGridSvg(): string {
	return canvas(`
		${text("The sidebar, live on your desk.", 110, 150, 58, "#f7f6fb", 820)}
		${text("Titles and order come directly from super.engineering.", 114, 210, 27, "#a7a5b6", 500)}
		${deck(130, 310, 4, 2, 200, 24, [
			sessionImages[0],
			sessionImages[1],
			sessionImages[2],
			sessionImages[3],
			sessionImages[4],
			sessionImages[5],
			sessionImages[6],
			sessionImages[7],
		])}
		${feature("LIVE UPDATES", "Agent and PR state", 1_210, 390, "#49e2a5")}
		${feature("ONE-KEY FOCUS", "Press to activate", 1_210, 535, "#8a72ff")}
		${feature("ALWAYS IN SYNC", "Selection follows the App", 1_210, 680, "#5b9dff")}
	`);
}

function deviceLayoutsSvg(): string {
	return canvas(`
		${text("Built for every key layout.", 110, 150, 58, "#f7f6fb", 820)}
		${text("Session slots adapt independently on every connected device.", 114, 210, 27, "#a7a5b6", 500)}
		${layoutDevice("MINI", "6 LCD KEYS", 90, 330, 420, 270, 3, 2)}
		${layoutDevice("STREAM DECK", "15 LCD KEYS", 590, 330, 500, 270, 5, 3, 7)}
		${layoutDevice("XL", "32 LCD KEYS", 1_170, 330, 650, 270, 8, 4)}
	`);
}

function sessionStatesSvg(): string {
	const waiting = renderSessionImage(sessions[2]);
	const working = renderSessionImage(sessions[1]);
	const merged = renderSessionImage(sessions[3]);
	const selected = renderSessionImage(sessions[0]);
	const deleting = renderDeleteConfirmationImage(sessions[5]);

	return canvas(`
		${text("Everything important, at a glance.", 110, 150, 58, "#f7f6fb", 820)}
		${text("Status is readable before you reach for the key.", 114, 210, 27, "#a7a5b6", 500)}
		${stateExample(waiting, "WAITING", "Needs attention", 102, 320, "#f5a623")}
		${stateExample(working, "WORKING", "Agent running", 454, 320, "#8066ff")}
		${stateExample(merged, "MERGED", "PR lifecycle", 806, 320, "#a371f7")}
		${stateExample(selected, "SELECTED", "Active session", 1_158, 320, "#5b9dff")}
		${stateExample(deleting, "SAFE DELETE", "Hold, then tap", 1_510, 320, "#ff6675")}
	`);
}

function canvas(content: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
		<defs>
			<linearGradient id="background" x1="0" y1="0" x2="${WIDTH}" y2="${HEIGHT}" gradientUnits="userSpaceOnUse">
				<stop stop-color="#0c0d12"/>
				<stop offset=".55" stop-color="#141322"/>
				<stop offset="1" stop-color="#0b0d13"/>
			</linearGradient>
		</defs>
		<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#background)"/>
		<path d="M96 258h1728" stroke="#8a72ff" stroke-opacity=".22"/>
		<style>text { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", Arial, sans-serif; }</style>
		${content}
	</svg>`;
}

function deck(
	x: number,
	y: number,
	columns: number,
	rows: number,
	keySize: number,
	gap: number,
	images: string[],
): string {
	const padding = 34;
	const width = columns * keySize + (columns - 1) * gap + padding * 2;
	const height = rows * keySize + (rows - 1) * gap + padding * 2;
	const keys = images.slice(0, columns * rows).map((source, index) => {
		const column = index % columns;
		const row = Math.floor(index / columns);
		return image(
			source,
			x + padding + column * (keySize + gap),
			y + padding + row * (keySize + gap),
			keySize,
			keySize,
		);
	}).join("");

	return `<g>
		<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="52" fill="#262832" stroke="#4c5060" stroke-width="4"/>
		<rect x="${x + 12}" y="${y + 12}" width="${width - 24}" height="${height - 24}" rx="42" fill="#181a21"/>
		${keys}
	</g>`;
}

function layoutDevice(
	label: string,
	detail: string,
	x: number,
	y: number,
	width: number,
	height: number,
	columns: number,
	rows: number,
	selectedIndex?: number,
): string {
	const padding = 28;
	const gap = 12;
	const keySize = Math.min(
		(width - padding * 2 - gap * (columns - 1)) / columns,
		(height - padding * 2 - gap * (rows - 1)) / rows,
	);
	const gridWidth = columns * keySize + (columns - 1) * gap;
	const gridHeight = rows * keySize + (rows - 1) * gap;
	const startX = x + (width - gridWidth) / 2;
	const startY = y + (height - gridHeight) / 2;
	const keys = Array.from({ length: columns * rows }, (_, index) => {
		const column = index % columns;
		const row = Math.floor(index / columns);
		return layoutKey(
			startX + column * (keySize + gap),
			startY + row * (keySize + gap),
			keySize,
			index,
			index === selectedIndex,
		);
	}).join("");
	return `<g>
		<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="42" fill="#20222a" stroke="#4c5060" stroke-width="4"/>
		<rect x="${x + 10}" y="${y + 10}" width="${width - 20}" height="${height - 20}" rx="34" fill="#15171d"/>
		${keys}
		${text(label, x + width / 2, 660, 22, "#f7f6fb", 820, 1.4, "middle")}
		${text(detail, x + width / 2, 692, 14, "#8f92a2", 700, 1, "middle")}
	</g>`;
}

function layoutKey(
	x: number,
	y: number,
	size: number,
	index: number,
	isSelected: boolean,
): string {
	const stateColors = ["#42d392", "#8066ff", "#f5a623"];
	const stateColor = stateColors[index % stateColors.length];
	const inset = Math.max(2, size * .055);
	const radius = Math.max(5, size * .15);
	const markerRadius = Math.max(2.5, size * .055);
	const selectedStroke = Math.max(3, size * .07);
	return `<g>
		<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" fill="${isSelected ? "#142033" : "#1b1e24"}" stroke="${isSelected ? "#5b9dff" : "#353942"}" stroke-width="${isSelected ? selectedStroke : Math.max(1.5, size * .025)}"/>
		<circle cx="${x + size - inset * 2}" cy="${y + inset * 2}" r="${markerRadius}" fill="${stateColor}"/>
		<rect x="${x + inset * 1.5}" y="${y + size - inset * 2.6}" width="${size * .42}" height="${Math.max(3, size * .055)}" rx="${Math.max(1.5, size * .0275)}" fill="${stateColor}" fill-opacity=".75"/>
	</g>`;
}

function stateExample(
	source: string,
	label: string,
	description: string,
	x: number,
	y: number,
	color: string,
): string {
	return `<g>
		${image(source, x, y, 244, 244)}
		${text(label, x + 122, y + 322, 21, color, 850, 1.5, "middle")}
		${text(description, x + 122, y + 366, 18, "#aaa7b7", 540, 0, "middle")}
	</g>`;
}

function feature(
	label: string,
	description: string,
	x: number,
	y: number,
	color: string,
): string {
	return `<g>
		<circle cx="${x}" cy="${y - 10}" r="8" fill="${color}"/>
		${text(label, x + 28, y, 19, color, 850, 1.6)}
		${text(description, x + 28, y + 42, 25, "#f7f6fb", 650)}
	</g>`;
}

function image(source: string, x: number, y: number, width: number, height: number): string {
	return `<image href="${source}" x="${x}" y="${y}" width="${width}" height="${height}"/>`;
}

function text(
	value: string,
	x: number,
	y: number,
	size: number,
	color: string,
	weight: number,
	letterSpacing = 0,
	anchor: "start" | "middle" = "start",
): string {
	return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" letter-spacing="${letterSpacing}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
}

async function generate(name: string, svg: string): Promise<void> {
	const source = path.join(sourceDirectory, `${name}.svg`);
	const output = path.join(outputDirectory, `${name}.png`);
	await writeFile(source, svg, "utf8");
	execFileSync(converter!, [
		"-w",
		String(WIDTH),
		"-h",
		String(HEIGHT),
		"-o",
		output,
		source,
	]);
}

function dataUrl(value: Buffer, mediaType = "image/svg+xml"): string {
	return `data:${mediaType};base64,${value.toString("base64")}`;
}

function session(
	displayName: string,
	projectName: string,
	agentState: AgentState,
	insertions: number,
	deletions: number,
	isSelected = false,
	pullRequest?: PullRequest,
): SuperSession {
	return {
		agentSessions: [],
		agentState,
		branch: displayName.toLowerCase().replaceAll(" ", "-"),
		deletions,
		displayName,
		id: `${projectName}:${displayName}`,
		insertions,
		isPrimary: displayName === "main",
		isSelected,
		path: `/example/${displayName}`,
		projectName,
		pullRequest,
		state: insertions > 0 || deletions > 0 ? "dirty" : "clean",
	};
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}
