import streamDeck, { type KeyAction } from "@elgato/streamdeck";

import { resolveConfiguration, type PluginSettings } from "../configuration";
import {
	renderDeleteConfirmationImage,
	renderDeletingImage,
	renderEmptyImage,
	renderNavigationImage,
	renderSessionImage,
} from "./session-image";
import {
	clampPage,
	orderPositionedActions,
	sessionIndex,
	totalPages,
	wrappedPage,
} from "./session-pagination";
import { decideRefreshFailure } from "./refresh-resilience";
import {
	IntegrationError,
	type IntegrationErrorCode,
	type IntegrationHealth,
	SessionRepository,
	type WorkspaceWatchEvent,
} from "./session-repository";
import { updateSelectedSession } from "./session-selection";
import type { SuperSession } from "./session";

const DELETE_ARM_TIMEOUT_MILLISECONDS = 5_000;
const LONG_PRESS_MILLISECONDS = 700;
const WATCH_DEBOUNCE_MILLISECONDS = 150;
const LAYOUT_RENDER_DEBOUNCE_MILLISECONDS = 50;
const WATCH_RESTART_MAX_MILLISECONDS = 30_000;
const WATCH_RESTART_MIN_MILLISECONDS = 1_000;

type VisibleSlot = {
	action: KeyAction;
	actionId: string;
	column: number;
	row: number;
};

type VisibleNavigation = {
	action: KeyAction;
	direction: -1 | 1;
};

type ArmedDeletion = {
	actionId: string;
	id: string;
	timeout: NodeJS.Timeout;
};

type PressedSlot = {
	didArm: boolean;
	mode: "confirm-delete" | "normal";
	timeout?: NodeJS.Timeout;
};

export class SessionGridController {
	private armedDeletion: ArmedDeletion | undefined;
	private applicationKnownOffline = false;
	private deletingWorktree: { actionId: string; id: string } | undefined;
	private hasLoaded = false;
	private isConfigured = false;
	private layoutRenderTimer: NodeJS.Timeout | undefined;
	private loadError: IntegrationErrorCode | undefined;
	private pollTimer: NodeJS.Timeout | undefined;
	private refreshPromise: Promise<void> | undefined;
	private refreshQueued = false;
	private refreshFailureStartedAt: number | undefined;
	private refreshRetryTimer: NodeJS.Timeout | undefined;
	private selectionGeneration = 0;
	private selectedItemIdFromWatch: string | undefined;
	private sessions: SuperSession[] = [];
	private settings: PluginSettings = {};
	private updateGeneration = 0;
	private watchDebounceTimer: NodeJS.Timeout | undefined;
	private watchRestartAttempt = 0;
	private watchRestartTimer: NodeJS.Timeout | undefined;
	private watchStop: (() => void) | undefined;
	private readonly imageCache = new Map<string, string>();
	private readonly pageByDevice = new Map<string, number>();
	private readonly pressedSlots = new Map<string, PressedSlot>();
	private readonly visibleNavigation = new Map<string, VisibleNavigation>();
	private readonly visibleSlots = new Map<string, VisibleSlot>();

	constructor(private readonly repository: SessionRepository) {}

	configure(settings: PluginSettings): void {
		this.settings = settings;
		const configuration = resolveConfiguration(settings);
		streamDeck.logger.info(`Configured sc workspace source: ${configuration.scPath}`);
		this.repository.setConfiguration(configuration);
		this.isConfigured = true;
		this.resetRefreshFailure();
		this.restartUpdates();
		void this.refresh();
	}

	register(action: KeyAction): void {
		if (!action.coordinates) {
			return;
		}

		const { column, row } = action.coordinates;
		streamDeck.logger.info(
			`Session slot appeared on ${action.device.name} at row ${row}, column ${column}`,
		);
		this.visibleSlots.set(action.id, {
			action,
			actionId: action.id,
			column,
			row,
		});
		this.imageCache.delete(action.id);
		void action.setTitle("");
		this.normalizeDevicePage(action.device.id);
		this.ensureUpdates();
		if (this.hasLoaded) {
			this.scheduleLayoutRender();
		}
		if (this.isConfigured && !this.hasLoaded && !this.refreshPromise) {
			void this.refresh();
		}
	}

	unregister(actionId: string): void {
		const slot = this.visibleSlots.get(actionId);
		this.clearPressedSlot(actionId);
		if (this.armedDeletion?.actionId === actionId) {
			this.clearArmedDeletion();
		}
		this.visibleSlots.delete(actionId);
		this.imageCache.delete(actionId);
		if (slot) {
			this.normalizeDevicePage(slot.action.device.id);
		}
		this.scheduleLayoutRender();
		if (!this.hasVisibleSurface()) {
			this.stopUpdates();
		}
	}

	registerNavigation(action: KeyAction, direction: -1 | 1): void {
		this.visibleNavigation.set(action.id, { action, direction });
		this.imageCache.delete(action.id);
		void action.setTitle("");
		this.normalizeDevicePage(action.device.id);
		this.scheduleLayoutRender();
		this.ensureUpdates();
		if (this.isConfigured && !this.hasLoaded && !this.refreshPromise) {
			void this.refresh();
		}
	}

	unregisterNavigation(actionId: string): void {
		this.visibleNavigation.delete(actionId);
		this.imageCache.delete(actionId);
		this.scheduleLayoutRender();
		if (!this.hasVisibleSurface()) {
			this.stopUpdates();
		}
	}

	async navigate(actionId: string): Promise<void> {
		const navigation = this.visibleNavigation.get(actionId);
		if (!navigation) {
			return;
		}

		const deviceId = navigation.action.device.id;
		const slotCount = this.slotsForDevice(deviceId).length;
		const currentPage = this.pageForDevice(deviceId);
		const pageCount = totalPages(this.sessions.length, slotCount);
		if (pageCount <= 1) {
			await navigation.action.showAlert();
			return;
		}
		const nextPage = wrappedPage(
			currentPage,
			navigation.direction,
			this.sessions.length,
			slotCount,
		);

		this.clearArmedDeletion();
		this.pageByDevice.set(deviceId, nextPage);
		await this.renderVisibleSurfaces();
	}

	async refresh(): Promise<void> {
		if (this.refreshPromise) {
			this.refreshQueued = true;
			return this.refreshPromise;
		}

		do {
			this.refreshQueued = false;
			this.refreshPromise = this.performRefresh();
			try {
				await this.refreshPromise;
			} finally {
				this.refreshPromise = undefined;
			}
		} while (this.refreshQueued);
	}

	async checkHealth(): Promise<IntegrationHealth> {
		return this.repository.checkHealth(true);
	}

	async activate(actionId: string): Promise<void> {
		const slot = this.visibleSlots.get(actionId);
		if (!slot) {
			return;
		}

		let session = this.sessionForAction(actionId);
		if (!session) {
			await this.refresh();
			session = this.sessionForAction(actionId);
		}
		if (!session && this.loadError === "sc-offline") {
			await this.activateApplication();
			await this.refresh();
			session = this.sessionForAction(actionId);
		}
		if (!session) {
			await slot.action.showAlert();
			return;
		}

		const previousSelection = this.sessions.find((candidate) => candidate.isSelected)?.id;
		for (const candidate of this.sessions) {
			candidate.isSelected = candidate.id === session.id;
		}
		await this.renderVisibleSurfaces();

		try {
			await this.repository.activate(session);
		} catch (error) {
			for (const candidate of this.sessions) {
				candidate.isSelected = candidate.id === previousSelection;
			}
			await this.renderVisibleSurfaces();
			streamDeck.logger.error(`Unable to activate ${session.id}: ${errorMessage(error)}`);
			await slot.action.showAlert();
			return;
		}

		await this.refresh();
	}

	async keyDown(actionId: string): Promise<void> {
		const slot = this.visibleSlots.get(actionId);
		if (!slot || this.pressedSlots.has(actionId)) {
			return;
		}
		if (this.deletingWorktree?.actionId === actionId) {
			return;
		}

		if (this.armedDeletion?.actionId === actionId) {
			this.pressedSlots.set(actionId, { didArm: false, mode: "confirm-delete" });
			return;
		}

		if (this.armedDeletion) {
			this.clearArmedDeletion();
			await this.renderVisibleSurfaces();
		}

		const pressed: PressedSlot = { didArm: false, mode: "normal" };
		pressed.timeout = setTimeout(() => void this.armDeletion(actionId), LONG_PRESS_MILLISECONDS);
		this.pressedSlots.set(actionId, pressed);
	}

	async keyUp(actionId: string): Promise<void> {
		const pressed = this.pressedSlots.get(actionId);
		if (!pressed) {
			return;
		}

		this.pressedSlots.delete(actionId);
		if (pressed.timeout) {
			clearTimeout(pressed.timeout);
		}

		if (pressed.mode === "confirm-delete") {
			await this.confirmDeletion(actionId);
			return;
		}
		if (!pressed.didArm) {
			await this.activate(actionId);
		}
	}

	async activateApplication(): Promise<void> {
		await this.repository.activateApplication();
		this.repository.invalidateHealth();
		await this.repository.waitUntilReady();
	}

	applicationDidLaunch(): void {
		if (!this.applicationKnownOffline) {
			return;
		}
		this.applicationKnownOffline = false;
		this.repository.invalidateHealth();
		this.loadError = undefined;
		this.resetRefreshFailure();
		this.restartUpdates();
		void this.refresh();
	}

	applicationDidTerminate(): void {
		this.applicationKnownOffline = true;
		this.repository.invalidateHealth();
		this.loadError = "sc-offline";
		this.resetRefreshFailure();
		this.stopUpdates();
		void this.renderVisibleSurfaces();
	}

	private async performRefresh(): Promise<void> {
		streamDeck.logger.debug("Refreshing sessions from sc workspace list");
		const previousFailureStartedAt = this.refreshFailureStartedAt;
		const selectionGenerationAtStart = this.selectionGeneration;
		try {
			const result = await this.repository.loadSessions();
			if (this.selectionGeneration !== selectionGenerationAtStart
				&& this.selectedItemIdFromWatch) {
				updateSelectedSession(result.sessions, this.selectedItemIdFromWatch);
			}
			const previousSessionIds = this.sessions.map((session) => session.id).join("\n");
			const nextSessionIds = result.sessions.map((session) => session.id).join("\n");
			const shouldLogAtInfo = !this.hasLoaded
				|| this.loadError !== undefined
				|| previousSessionIds !== nextSessionIds;
			this.sessions = result.sessions;
			this.applicationKnownOffline = false;
			this.loadError = undefined;
			this.resetRefreshFailure();
			this.hasLoaded = true;
			const loadMessage = `Loaded ${this.sessions.length} sidebar sessions`;
			if (shouldLogAtInfo) {
				streamDeck.logger.info(loadMessage);
			} else {
				streamDeck.logger.debug(loadMessage);
			}
			if (result.errors.length > 0) {
				streamDeck.logger.warn(`Ignored malformed sidebar rows:\n${result.errors.join("\n")}`);
			}
			if (previousFailureStartedAt !== undefined) {
				const duration = Math.max(1, Date.now() - previousFailureStartedAt);
				streamDeck.logger.info(`Session refresh recovered after ${duration} ms`);
			}
		} catch (error) {
			this.hasLoaded = true;
			const errorCode = error instanceof IntegrationError ? error.code : "unknown";
			const decision = decideRefreshFailure(
				this.sessions.length > 0,
				this.applicationKnownOffline,
				this.refreshFailureStartedAt,
			);
			this.refreshFailureStartedAt = decision.failureStartedAt;
			this.scheduleRefreshRetry(decision.retryDelayMilliseconds);

			if (decision.deferError) {
				streamDeck.logger.warn(
					`Transient session refresh failure; keeping the last successful state: ${errorMessage(error)}`,
				);
			} else {
				this.loadError = errorCode;
				if (this.loadError === "sc-offline") {
					this.applicationKnownOffline = true;
				}
				streamDeck.logger.error(`Unable to refresh sessions: ${errorMessage(error)}`);
			}
		}

		this.normalizeAllDevicePages();
		await this.renderVisibleSurfaces();
	}

	private async armDeletion(actionId: string): Promise<void> {
		const pressed = this.pressedSlots.get(actionId);
		const slot = this.visibleSlots.get(actionId);
		const session = this.sessionForAction(actionId);
		if (!pressed || !slot || !session) {
			return;
		}

		pressed.didArm = true;
		if (session.isPrimary) {
			await slot.action.showAlert();
			return;
		}

		this.clearArmedDeletion();
		const timeout = setTimeout(() => {
			this.clearArmedDeletion();
			void this.renderVisibleSurfaces();
		}, DELETE_ARM_TIMEOUT_MILLISECONDS);
		this.armedDeletion = { actionId, id: session.id, timeout };
		await this.setImageIfChanged(slot.action, renderDeleteConfirmationImage(session));
	}

	private async confirmDeletion(actionId: string): Promise<void> {
		const armed = this.armedDeletion;
		const slot = this.visibleSlots.get(actionId);
		if (!armed || armed.actionId !== actionId || !slot) {
			return;
		}

		const displayedSession = this.sessionForAction(actionId);
		if (displayedSession?.id !== armed.id) {
			this.clearArmedDeletion();
			await this.renderVisibleSurfaces();
			await slot.action.showAlert();
			return;
		}

		const session = this.sessions.find((candidate) => candidate.id === armed.id);
		this.clearArmedDeletion();
		if (!session) {
			await this.refresh();
			await slot.action.showAlert();
			return;
		}

		try {
			this.deletingWorktree = { actionId, id: session.id };
			await this.setImageIfChanged(slot.action, renderDeletingImage(session));
			streamDeck.logger.info(`Deleting worktree item ${session.id}`);
			await this.repository.removeWorktree(session);
			streamDeck.logger.info(`Deleted worktree item ${session.id}`);
			this.deletingWorktree = undefined;
			await this.refresh();
		} catch (error) {
			this.deletingWorktree = undefined;
			streamDeck.logger.error(`Unable to delete ${session.id}: ${errorMessage(error)}`);
			await this.renderVisibleSurfaces();
			await slot.action.showAlert();
		}
	}

	private async renderVisibleSurfaces(): Promise<void> {
		const updates: Promise<void>[] = [];
		for (const slot of this.visibleSlots.values()) {
			updates.push(this.setImageIfChanged(slot.action, this.renderSlotImage(slot.action.id)));
		}
		for (const navigation of this.visibleNavigation.values()) {
			const deviceId = navigation.action.device.id;
			const slotCount = this.slotsForDevice(deviceId).length;
			const page = this.pageForDevice(deviceId);
			const pageCount = totalPages(this.sessions.length, slotCount);
			const enabled = pageCount > 1;
			updates.push(this.setImageIfChanged(
				navigation.action,
				renderNavigationImage(navigation.direction, page, pageCount, enabled),
			));
		}

		const results = await Promise.allSettled(updates);
		for (const result of results) {
			if (result.status === "rejected") {
				streamDeck.logger.error(`Unable to render Stream Deck key: ${errorMessage(result.reason)}`);
			}
		}
	}

	private renderSlotImage(actionId: string): string {
		const session = this.sessionForAction(actionId);
		if (!session) {
			const slot = this.visibleSlots.get(actionId);
			const isFirstSlot = slot
				? this.slotsForDevice(slot.action.device.id)[0]?.action.id === actionId
				: false;
			return renderEmptyImage(isFirstSlot ? errorLabel(this.loadError) : undefined);
		}
		if (this.deletingWorktree?.actionId === actionId && this.deletingWorktree.id === session.id) {
			return renderDeletingImage(session);
		}
		if (this.armedDeletion?.actionId === actionId && this.armedDeletion.id === session.id) {
			return renderDeleteConfirmationImage(session);
		}
		return renderSessionImage(session, { staleLabel: staleStatusLabel(this.loadError) });
	}

	private sessionForAction(actionId: string): SuperSession | undefined {
		const slot = this.visibleSlots.get(actionId);
		if (!slot) {
			return undefined;
		}

		const deviceId = slot.action.device.id;
		const slots = this.slotsForDevice(deviceId);
		const ordinal = slots.findIndex((candidate) => candidate.action.id === actionId);
		if (ordinal < 0) {
			return undefined;
		}
		return this.sessions[sessionIndex(this.pageForDevice(deviceId), slots.length, ordinal)];
	}

	private slotsForDevice(deviceId: string): VisibleSlot[] {
		return orderPositionedActions(
			[...this.visibleSlots.values()].filter((slot) => slot.action.device.id === deviceId),
		);
	}

	private pageForDevice(deviceId: string): number {
		return this.pageByDevice.get(deviceId) ?? 0;
	}

	private normalizeAllDevicePages(): void {
		const deviceIds = new Set<string>();
		for (const slot of this.visibleSlots.values()) {
			deviceIds.add(slot.action.device.id);
		}
		for (const navigation of this.visibleNavigation.values()) {
			deviceIds.add(navigation.action.device.id);
		}
		for (const deviceId of deviceIds) {
			this.normalizeDevicePage(deviceId);
		}
	}

	private normalizeDevicePage(deviceId: string): void {
		const page = clampPage(
			this.pageForDevice(deviceId),
			this.sessions.length,
			this.slotsForDevice(deviceId).length,
		);
		this.pageByDevice.set(deviceId, page);
	}

	private clearPressedSlot(actionId: string): void {
		const pressed = this.pressedSlots.get(actionId);
		if (pressed?.timeout) {
			clearTimeout(pressed.timeout);
		}
		this.pressedSlots.delete(actionId);
	}

	private clearArmedDeletion(): void {
		if (this.armedDeletion) {
			clearTimeout(this.armedDeletion.timeout);
			this.armedDeletion = undefined;
		}
	}

	private async setImageIfChanged(action: KeyAction, image: string): Promise<void> {
		if (this.imageCache.get(action.id) === image) {
			return;
		}
		await action.setImage(image);
		this.imageCache.set(action.id, image);
	}

	private scheduleLayoutRender(): void {
		if (this.layoutRenderTimer) {
			clearTimeout(this.layoutRenderTimer);
		}
		this.layoutRenderTimer = setTimeout(() => {
			this.layoutRenderTimer = undefined;
			void this.renderVisibleSurfaces();
		}, LAYOUT_RENDER_DEBOUNCE_MILLISECONDS);
	}

	private scheduleRefreshRetry(delayMilliseconds: number): void {
		if (this.refreshRetryTimer || !this.isConfigured || !this.hasVisibleSurface()) {
			return;
		}
		this.refreshRetryTimer = setTimeout(() => {
			this.refreshRetryTimer = undefined;
			void this.refresh();
		}, delayMilliseconds);
	}

	private resetRefreshFailure(): void {
		this.refreshFailureStartedAt = undefined;
		if (this.refreshRetryTimer) {
			clearTimeout(this.refreshRetryTimer);
			this.refreshRetryTimer = undefined;
		}
	}

	private ensureUpdates(): void {
		if (this.isConfigured && !this.pollTimer && !this.watchStop && !this.watchRestartTimer) {
			this.startUpdates();
		}
	}

	private restartUpdates(): void {
		this.stopUpdates();
		this.startUpdates();
	}

	private startUpdates(): void {
		if (!this.isConfigured || !this.hasVisibleSurface()) {
			return;
		}

		const generation = ++this.updateGeneration;
		const { pollIntervalMilliseconds } = resolveConfiguration(this.settings);
		this.pollTimer = setInterval(() => void this.refresh(), pollIntervalMilliseconds);
		this.watchRestartAttempt = 0;
		this.startWatch(generation);
	}

	private startWatch(generation: number): void {
		if (generation !== this.updateGeneration || !this.hasVisibleSurface()) {
			return;
		}

		try {
			this.watchStop = this.repository.watch(
				(event) => this.handleWatchEvent(generation, event),
				(error) => this.handleWatchError(generation, error),
			);
			streamDeck.logger.info("Watching sc workspace changes");
		} catch (error) {
			this.handleWatchError(generation, error instanceof Error ? error : new Error(String(error)));
		}
	}

	private handleWatchEvent(generation: number, event: WorkspaceWatchEvent): void {
		if (generation !== this.updateGeneration) {
			return;
		}

		this.watchRestartAttempt = 0;
		if (event.type === "selection" && event.selectedItemId) {
			this.selectedItemIdFromWatch = event.selectedItemId;
			this.selectionGeneration += 1;
			if (updateSelectedSession(this.sessions, event.selectedItemId)) {
				this.scheduleLayoutRender();
			}
			return;
		}
		this.scheduleWatchRefresh(generation);
	}

	private scheduleWatchRefresh(generation: number): void {
		if (generation !== this.updateGeneration) {
			return;
		}
		if (this.watchDebounceTimer) {
			clearTimeout(this.watchDebounceTimer);
		}
		this.watchDebounceTimer = setTimeout(() => {
			this.watchDebounceTimer = undefined;
			void this.refresh();
		}, WATCH_DEBOUNCE_MILLISECONDS);
	}

	private handleWatchError(generation: number, error: Error): void {
		if (generation !== this.updateGeneration) {
			return;
		}
		streamDeck.logger.warn(`sc workspace watch disconnected: ${error.message}`);
		this.watchStop?.();
		this.watchStop = undefined;
		if (this.watchRestartTimer) {
			return;
		}

		const delay = Math.min(
			WATCH_RESTART_MAX_MILLISECONDS,
			WATCH_RESTART_MIN_MILLISECONDS * (2 ** this.watchRestartAttempt),
		);
		this.watchRestartAttempt += 1;
		this.watchRestartTimer = setTimeout(() => {
			this.watchRestartTimer = undefined;
			this.startWatch(generation);
		}, delay);
	}

	private stopUpdates(): void {
		this.updateGeneration += 1;
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = undefined;
		}
		if (this.layoutRenderTimer) {
			clearTimeout(this.layoutRenderTimer);
			this.layoutRenderTimer = undefined;
		}
		if (this.watchDebounceTimer) {
			clearTimeout(this.watchDebounceTimer);
			this.watchDebounceTimer = undefined;
		}
		if (this.watchRestartTimer) {
			clearTimeout(this.watchRestartTimer);
			this.watchRestartTimer = undefined;
		}
		this.resetRefreshFailure();
		this.watchStop?.();
		this.watchStop = undefined;
	}

	private hasVisibleSurface(): boolean {
		return this.visibleSlots.size > 0 || this.visibleNavigation.size > 0;
	}
}

function errorLabel(error: IntegrationErrorCode | undefined): string | undefined {
	switch (error) {
		case "sc-missing":
			return "INSTALL SUPER";
		case "sc-offline":
			return "OPEN SUPER";
		case "sc-incompatible":
			return "UPDATE SUPER";
		case "sc-invalid":
			return "SC ERROR";
		case "unknown":
			return "RETRY";
		case undefined:
			return undefined;
	}
}

function staleStatusLabel(error: IntegrationErrorCode | undefined): string | undefined {
	switch (error) {
		case "sc-missing":
			return "MISSING";
		case "sc-offline":
			return "OFFLINE";
		case "sc-incompatible":
			return "UPDATE";
		case "sc-invalid":
		case "unknown":
			return "STALE";
		case undefined:
			return undefined;
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
