import streamDeck from "@elgato/streamdeck";

import { BackAction } from "./actions/back";
import { OpenSessionsAction } from "./actions/open-sessions";
import { NextSessionsAction, PreviousSessionsAction } from "./actions/session-navigation";
import { SessionSlotAction } from "./actions/session-slot";
import { resolveConfiguration, type PluginSettings } from "./configuration";
import { SessionGridController } from "./sessions/session-grid-controller";
import { SessionRepository } from "./sessions/session-repository";

streamDeck.logger.setLevel("info");

const repository = new SessionRepository(resolveConfiguration());
const gridController = new SessionGridController(repository);

streamDeck.actions.registerAction(new OpenSessionsAction(gridController));
streamDeck.actions.registerAction(new SessionSlotAction(gridController));
streamDeck.actions.registerAction(new PreviousSessionsAction(gridController));
streamDeck.actions.registerAction(new NextSessionsAction(gridController));
streamDeck.actions.registerAction(new BackAction());

streamDeck.system.onApplicationDidLaunch(() => {
	gridController.applicationDidLaunch();
});
streamDeck.system.onApplicationDidTerminate(() => {
	gridController.applicationDidTerminate();
});

await streamDeck.connect();
streamDeck.logger.info("super.engineering plugin connected");

try {
	gridController.configure(await streamDeck.settings.getGlobalSettings<PluginSettings>());
} catch (error) {
	streamDeck.logger.warn(`Using default settings: ${error instanceof Error ? error.message : String(error)}`);
	gridController.configure({});
}

streamDeck.settings.onDidReceiveGlobalSettings<PluginSettings>((event) => {
	gridController.configure(event.settings);
});
