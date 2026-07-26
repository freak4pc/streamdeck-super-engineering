import streamDeck, {
	action,
	type KeyDownEvent,
	type SendToPluginEvent,
	SingletonAction,
} from "@elgato/streamdeck";

import type { SessionGridController } from "../sessions/session-grid-controller";
import type { PluginSettings } from "../configuration";

@action({ UUID: "com.freak4pc.super-engineering.open-sessions" })
export class OpenSessionsAction extends SingletonAction {
	constructor(private readonly gridController: SessionGridController) {
		super();
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		try {
			await this.gridController.activateApplication();
			await this.gridController.refresh();
		} catch (error) {
			streamDeck.logger.error(`Unable to open sessions: ${errorMessage(error)}`);
			await ev.action.showAlert();
		}
	}

	override onSendToPlugin(ev: SendToPluginEvent<{ event?: string }, PluginSettings>): void {
		if (isHealthRequest(ev.payload)) {
			void this.sendHealthAndRefresh();
		}
	}

	private async sendHealthAndRefresh(): Promise<void> {
		await this.sendHealth();
		await this.gridController.refresh();
	}

	private async sendHealth(): Promise<void> {
		try {
			const health = await this.gridController.checkHealth();
			await streamDeck.ui.sendToPropertyInspector({ event: "integrationHealth", health });
		} catch (error) {
			streamDeck.logger.error(`Unable to inspect integration health: ${errorMessage(error)}`);
			await streamDeck.ui.sendToPropertyInspector({
				event: "integrationHealth",
				health: {
					github: {
						message: "Unable to inspect GitHub CLI.",
						state: "unavailable",
					},
					sc: {
						message: errorMessage(error),
						state: "invalid",
					},
				},
			});
		}
	}
}

function isHealthRequest(payload: unknown): boolean {
	return Boolean(
		payload
		&& typeof payload === "object"
		&& (payload as Record<string, unknown>).event === "checkHealth",
	);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
