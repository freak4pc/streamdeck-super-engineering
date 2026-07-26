import streamDeck, { action, type KeyDownEvent, SingletonAction } from "@elgato/streamdeck";

@action({ UUID: "com.freak4pc.super-engineering.back" })
export class BackAction extends SingletonAction {
	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await streamDeck.profiles.switchToProfile(ev.action.device.id);
	}
}
