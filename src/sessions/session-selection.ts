import type { SuperSession } from "./session";

export function updateSelectedSession(sessions: SuperSession[], selectedItemId: string): boolean {
	let changed = false;
	for (const session of sessions) {
		const isSelected = session.id === selectedItemId;
		if (session.isSelected !== isSelected) {
			session.isSelected = isSelected;
			changed = true;
		}
	}
	return changed;
}
