import {
	action,
	type KeyDownEvent,
	type KeyUpEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";

import type { SessionGridController } from "../sessions/session-grid-controller";

@action({ UUID: "com.freak4pc.super-engineering.session-slot" })
export class SessionSlotAction extends SingletonAction {
	constructor(private readonly gridController: SessionGridController) {
		super();
	}

	override onWillAppear(ev: WillAppearEvent): void {
		if (!ev.action.isKey() || !ev.action.coordinates) {
			return;
		}

		this.gridController.register(ev.action);
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.gridController.unregister(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await this.gridController.keyDown(ev.action.id);
	}

	override async onKeyUp(ev: KeyUpEvent): Promise<void> {
		await this.gridController.keyUp(ev.action.id);
	}
}
