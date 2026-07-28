import type { SuperSession } from "./session";

const BACKGROUND = "#16181c";
const BORDER = "#30343b";
const MUTED = "#8d96a5";
const TEXT = "#f7f8fa";
const PROJECT_CHARACTER_LIMIT = 7;
const TITLE_CHARACTER_LIMIT = 14;

export function renderSessionImage(
	session: SuperSession,
	options: { staleLabel?: string } = {},
): string {
	const describedStatus = describeSessionStatus(session);
	const statusColor = options.staleLabel ? "#f5b942" : describedStatus.color;
	const statusLabel = options.staleLabel ?? describedStatus.label;
	const [firstLine, secondLine] = wrapLabel(session.displayName);
	const borderColor = session.isSelected ? "#5b9dff" : BORDER;
	const borderWidth = session.isSelected ? 7 : 2;
	const borderInset = session.isSelected ? 6 : 1;
	const borderSize = 144 - (borderInset * 2);
	const borderRadius = session.isSelected ? 13 : 17;
	const background = session.isSelected ? "#131e2c" : BACKGROUND;

	return svg(`
		<rect width="144" height="144" rx="18" fill="${background}"/>
		<rect x="${borderInset}" y="${borderInset}" width="${borderSize}" height="${borderSize}" rx="${borderRadius}" fill="none" stroke="${borderColor}" stroke-width="${borderWidth}"/>
		${options.staleLabel ? `<rect x="14" y="135" width="116" height="3" rx="1.5" fill="#f5b942"/>` : ""}
		${renderDiff(session)}
		${renderTopRightStatus(session, statusColor)}
		<text x="14" y="62" fill="${TEXT}" font-size="18" font-weight="700">${escapeXml(firstLine)}</text>
		${secondLine ? `<text x="14" y="84" fill="${TEXT}" font-size="18" font-weight="700">${escapeXml(secondLine)}</text>` : ""}
		<text x="14" y="123" fill="${MUTED}" font-size="10" font-weight="750" letter-spacing=".5">${escapeXml(truncate(session.projectName.toUpperCase(), PROJECT_CHARACTER_LIMIT))}</text>
		<rect x="78" y="108" width="56" height="22" rx="11" fill="${statusColor}" fill-opacity=".14" stroke="${statusColor}" stroke-opacity=".55"/>
		<text x="106" y="123" text-anchor="middle" fill="${statusColor}" font-size="9" font-weight="800" letter-spacing=".35">${statusLabel}</text>
	`);
}

function renderTopRightStatus(session: SuperSession, sessionStatusColor: string): string {
	if (!session.pullRequest) {
		return `<circle cx="126" cy="20" r="7" fill="${sessionStatusColor}"/>`;
	}

	const pullRequestColor = session.pullRequest.state === "merged"
		? "#a371f7"
		: session.pullRequest.state === "closed"
			? MUTED
			: {
				failing: "#ff5d67",
				passing: "#42d392",
				pending: "#f5b942",
				unknown: MUTED,
			}[session.pullRequest.checkState];

	return `<rect x="76" y="8" width="60" height="24" rx="8" fill="#20242a" stroke="${pullRequestColor}" stroke-opacity=".65"/>
		<g transform="translate(79 9) scale(.62)" fill="none" stroke="${pullRequestColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="6" cy="6" r="3"/>
			<circle cx="18" cy="18" r="3"/>
			<path d="M6 9v12M13 6h3a2 2 0 0 1 2 2v7"/>
		</g>
		<text x="132" y="25" text-anchor="end" fill="${TEXT}" font-size="11" font-weight="800">${session.pullRequest.number}</text>`;
}

export function renderLoadingImage(): string {
	return svg(`
		<rect width="144" height="144" rx="18" fill="${BACKGROUND}"/>
		<rect x="1" y="1" width="142" height="142" rx="17" fill="none" stroke="${BORDER}" stroke-width="2"/>
		<circle cx="72" cy="64" r="18" fill="none" stroke="#7557ff" stroke-width="7" stroke-linecap="round" stroke-dasharray="62 52"/>
		<text x="72" y="108" text-anchor="middle" fill="${MUTED}" font-size="13" font-weight="650">LOADING</text>
	`);
}

export function renderEmptyImage(label = "EMPTY"): string {
	return svg(`
		<rect width="144" height="144" rx="18" fill="${BACKGROUND}"/>
		<rect x="1" y="1" width="142" height="142" rx="17" fill="none" stroke="${BORDER}" stroke-width="2"/>
		<path d="M48 72h48M72 48v48" stroke="#4b515c" stroke-width="7" stroke-linecap="round"/>
		<text x="72" y="121" text-anchor="middle" fill="${MUTED}" font-size="12" font-weight="650">${label}</text>
	`);
}

export function renderNavigationImage(
	direction: -1 | 1,
	currentPage: number,
	pageCount: number,
	enabled: boolean,
): string {
	const color = enabled ? "#f7f8fa" : "#555d69";
	const label = direction < 0 ? "PREVIOUS" : "NEXT";
	const arrow = direction < 0
		? "M88 43L59 72l29 29M61 72h39"
		: "M56 43l29 29-29 29M44 72h39";

	return svg(`
		<rect width="144" height="144" rx="18" fill="${BACKGROUND}"/>
		<rect x="1" y="1" width="142" height="142" rx="17" fill="none" stroke="${enabled ? BORDER : "#25292f"}" stroke-width="2"/>
		<path d="${arrow}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
		<text x="72" y="118" text-anchor="middle" fill="${color}" font-size="11" font-weight="800" letter-spacing=".6">${label}</text>
		<text x="72" y="134" text-anchor="middle" fill="${enabled ? MUTED : "#4a505a"}" font-size="9" font-weight="700">${currentPage + 1}/${pageCount}</text>
	`);
}

export function renderDeleteConfirmationImage(session: SuperSession): string {
	return svg(`
		<rect width="144" height="144" rx="18" fill="#291317"/>
		<rect x="6" y="6" width="132" height="132" rx="13" fill="none" stroke="#ff5364" stroke-width="7"/>
		<g transform="translate(45 25)" fill="none" stroke="#ff6675" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
			<path d="M5 14h44M18 14V7h18v7M12 14l4 42h22l4-42M24 25v20M34 25v20"/>
		</g>
		<text x="72" y="105" text-anchor="middle" fill="#ff6675" font-size="13" font-weight="900" letter-spacing=".5">TAP TO DELETE</text>
		<text x="72" y="125" text-anchor="middle" fill="#f5c4ca" font-size="11" font-weight="700">${escapeXml(truncate(session.displayName, 20))}</text>
	`);
}

export function renderDeletingImage(session: SuperSession): string {
	return svg(`
		<rect width="144" height="144" rx="18" fill="#17191d"/>
		<rect x="6" y="6" width="132" height="132" rx="13" fill="none" stroke="#687180" stroke-width="5"/>
		<circle cx="72" cy="55" r="20" fill="none" stroke="#a8b0bc" stroke-width="7" stroke-linecap="round" stroke-dasharray="68 58"/>
		<text x="72" y="100" text-anchor="middle" fill="#d6dae0" font-size="13" font-weight="850" letter-spacing=".7">DELETING…</text>
		<text x="72" y="122" text-anchor="middle" fill="#8d96a5" font-size="11" font-weight="700">${escapeXml(truncate(session.displayName, 20))}</text>
	`);
}

function renderDiff(session: SuperSession): string {
	if (session.state === "unavailable") {
		return `<text x="14" y="25" fill="#ff7b83" font-size="12" font-weight="700">UNAVAILABLE</text>`;
	}

	return `<text x="14" y="25" font-size="13" font-weight="700"><tspan fill="#42d392">+${session.insertions}</tspan><tspan dx="7" fill="#ff6b75">-${session.deletions}</tspan></text>`;
}

export function describeSessionStatus(session: SuperSession): { color: string; label: string } {
	if (session.state === "unavailable") {
		return { color: "#ff5d67", label: "ERROR" };
	}

	if (session.agentState === "attention") {
		return { color: "#f5a623", label: "WAITING" };
	}

	if (session.agentState === "working") {
		return { color: "#8066ff", label: "WORKING" };
	}

	if (session.agentState === "idle") {
		return { color: "#42d392", label: "IDLE" };
	}

	return session.state === "dirty"
		? { color: "#f5b942", label: "CHANGED" }
		: { color: "#42d392", label: "CLEAN" };
}

function wrapLabel(label: string): [string, string?] {
	const words = label.split(/\s+/).filter(Boolean);
	let first = "";
	let second = "";

	for (const word of words) {
		if (!first) {
			first = truncate(word, TITLE_CHARACTER_LIMIT);
		} else if (characterLength(`${first} ${word}`) <= TITLE_CHARACTER_LIMIT) {
			first = `${first} ${word}`;
		} else if (!second) {
			second = truncate(word, TITLE_CHARACTER_LIMIT);
		} else if (characterLength(`${second} ${word}`) <= TITLE_CHARACTER_LIMIT) {
			second = `${second} ${word}`;
		}
	}

	if (!first) {
		return [truncate(label, TITLE_CHARACTER_LIMIT)];
	}

	const consumed = [first, second].filter(Boolean).join(" ").split(/\s+/).length;
	if (consumed < words.length) {
		second = ensureTrailingEllipsis(second || words[1] || "", TITLE_CHARACTER_LIMIT);
	}

	return second ? [first, second] : [first];
}

function truncate(value: string, length: number): string {
	const characters = Array.from(value);
	return characters.length <= length
		? value
		: `${characters.slice(0, Math.max(0, length - 1)).join("")}…`;
}

function ensureTrailingEllipsis(value: string, length: number): string {
	if (value.endsWith("…")) {
		return value;
	}

	const characters = Array.from(value);
	return characters.length >= length
		? `${characters.slice(0, Math.max(0, length - 1)).join("")}…`
		: `${value}…`;
}

function characterLength(value: string): number {
	return Array.from(value).length;
}

function svg(content: string): string {
	const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144">
		<style>text { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif; }</style>
		${content}
	</svg>`;

	return `data:image/svg+xml;base64,${Buffer.from(markup, "utf8").toString("base64")}`;
}

function escapeXml(value: string): string {
	return value
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}
