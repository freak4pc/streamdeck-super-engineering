import {
	action,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import type { SessionGridController } from "../sessions/session-grid-controller";

@action({ UUID: "com.freak4pc.super-engineering.previous-sessions" })
export class PreviousSessionsAction extends SingletonAction {
	constructor(private readonly gridController: SessionGridController) {
		super();
	}

	override onWillAppear(ev: WillAppearEvent): void {
		if (ev.action.isKey()) {
			this.gridController.registerNavigation(ev.action, -1);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.gridController.unregisterNavigation(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await this.gridController.navigate(ev.action.id);
	}
}

@action({ UUID: "com.freak4pc.super-engineering.next-sessions" })
export class NextSessionsAction extends SingletonAction {
	constructor(private readonly gridController: SessionGridController) {
		super();
	}

	override onWillAppear(ev: WillAppearEvent): void {
		if (ev.action.isKey()) {
			this.gridController.registerNavigation(ev.action, 1);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.gridController.unregisterNavigation(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await this.gridController.navigate(ev.action.id);
	}
}
