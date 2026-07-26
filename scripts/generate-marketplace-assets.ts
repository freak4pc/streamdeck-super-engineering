import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
	renderDeleteConfirmationImage,
	renderNavigationImage,
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

const back = dataUrl(
	await readFile("com.freak4pc.super-engineering.sdPlugin/imgs/actions/back/key.svg"),
);

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
const nextImage = renderNavigationImage(1, 0, 3, true);

// The app icon, Marketplace thumbnail, and GitHub social preview use curated campaign artwork.
// Keep this generator focused on reproducible product screenshots.
await generate("gallery-live-grid", liveGridSvg());
await generate("gallery-device-layouts", deviceLayoutsSvg());
await generate("gallery-session-states", sessionStatesSvg());

function liveGridSvg(): string {
	return canvas(`
		${glow(1_400, 470, 720, "#2ccf9f", .12)}
		${text("The sidebar, live on your desk.", 110, 150, 58, "#ffffff", 820)}
		${text("Titles and order come directly from super.engineering.", 114, 210, 27, "#a7a5b6", 500)}
		${deck(180, 300, 4, 2, 210, 28, [
			sessionImages[0],
			sessionImages[1],
			sessionImages[2],
			sessionImages[3],
			sessionImages[4],
			sessionImages[5],
			sessionImages[6],
			sessionImages[7],
		])}
		${feature("LIVE", "Agent and PR changes update automatically", 1_210, 350, "#49e2a5")}
		${feature("FOCUS", "One press activates the exact session", 1_210, 485, "#7d69ff")}
		${feature("MATCH", "Selection follows changes made in the App", 1_210, 620, "#5b9dff")}
	`);
}

function deviceLayoutsSvg(): string {
	return canvas(`
		${glow(960, 560, 880, "#6f45ff", .16)}
		${text("Built for every key layout.", 110, 150, 58, "#ffffff", 820)}
		${text("Each connected device gets its own slots and page.", 114, 210, 27, "#a7a5b6", 500)}
		${layoutCard("MINI", 105, 300, 3, 2, 112, 14)}
		${layoutCard("STREAM DECK", 620, 300, 5, 3, 72, 10, 8)}
		${layoutCard("XL", 1_160, 300, 8, 4, 50, 7)}
	`);
}

function sessionStatesSvg(): string {
	const waiting = renderSessionImage(sessions[2]);
	const working = renderSessionImage(sessions[1]);
	const merged = renderSessionImage(sessions[3]);
	const selected = renderSessionImage(sessions[0]);
	const deleting = renderDeleteConfirmationImage(sessions[5]);

	return canvas(`
		${glow(960, 620, 900, "#ff7a8c", .08)}
		${text("Everything important, at a glance.", 110, 150, 58, "#ffffff", 820)}
		${text("Status is readable before you reach for the key.", 114, 210, 27, "#a7a5b6", 500)}
		${stateCard(waiting, "WAITING", "Needs your attention", 125, 325, "#f5a623")}
		${stateCard(working, "WORKING", "Agent is running", 475, 325, "#8066ff")}
		${stateCard(merged, "MERGED", "PR lifecycle included", 825, 325, "#a371f7")}
		${stateCard(selected, "SELECTED", "Strong active frame", 1_175, 325, "#5b9dff")}
		${stateCard(deleting, "SAFE DELETE", "Hold, then confirm", 1_525, 325, "#ff6675")}
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
			<filter id="blur"><feGaussianBlur stdDeviation="90"/></filter>
		</defs>
		<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#background)"/>
		<path d="M0 90h1920M0 870h1920" stroke="#ffffff" stroke-opacity=".035"/>
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

function layoutCard(
	label: string,
	x: number,
	y: number,
	columns: number,
	rows: number,
	keySize: number,
	gap: number,
	selectedIndex?: number,
): string {
	const padding = 22;
	const width = columns * keySize + (columns - 1) * gap + padding * 2;
	const height = rows * keySize + (rows - 1) * gap + padding * 2;
	const images = Array.from(
		{ length: columns * rows },
		(_, index) => renderSessionImage({
			...sessions[index % sessions.length],
			isSelected: index === selectedIndex,
		}),
	);
	return `<g>
		<rect x="${x}" y="${y}" width="${width}" height="${height + 94}" rx="34" fill="#171923" stroke="#343746" stroke-width="3"/>
		${deck(x, y, columns, rows, keySize, gap, images)}
		${text(label, x + width / 2, y + height + 62, 21, "#ffffff", 800, 1.5, "middle")}
		${text(`${columns * rows} LCD KEYS`, x + width / 2, y + height + 89, 14, "#888b9d", 650, 1, "middle")}
	</g>`;
}

function stateCard(
	source: string,
	label: string,
	description: string,
	x: number,
	y: number,
	color: string,
): string {
	return `<g>
		<rect x="${x - 28}" y="${y - 28}" width="300" height="486" rx="34" fill="#171923" stroke="#343746" stroke-width="3"/>
		${image(source, x, y, 244, 244)}
		${text(label, x + 122, y + 318, 21, color, 850, 1.5, "middle")}
		${multiline(description, x + 122, y + 360, 18, "#a7a5b6", 500, 26, "middle")}
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
		${text(description, x + 28, y + 42, 25, "#ffffff", 650)}
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

function multiline(
	value: string,
	x: number,
	y: number,
	size: number,
	color: string,
	weight: number,
	lineHeight: number,
	anchor: "start" | "middle",
): string {
	const words = value.split(" ");
	const midpoint = Math.ceil(words.length / 2);
	return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">
		<tspan x="${x}">${escapeXml(words.slice(0, midpoint).join(" "))}</tspan>
		<tspan x="${x}" dy="${lineHeight}">${escapeXml(words.slice(midpoint).join(" "))}</tspan>
	</text>`;
}

function glow(
	x: number,
	y: number,
	radius: number,
	color: string,
	opacity: number,
): string {
	return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" opacity="${opacity}" filter="url(#blur)"/>`;
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

function dataUrl(value: Buffer): string {
	return `data:image/svg+xml;base64,${value.toString("base64")}`;
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
