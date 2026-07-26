export type PositionedAction = {
	actionId: string;
	column: number;
	row: number;
};

export function orderPositionedActions<T extends PositionedAction>(actions: T[]): T[] {
	return [...actions].sort((left, right) => {
		return left.row - right.row
			|| left.column - right.column
			|| left.actionId.localeCompare(right.actionId);
	});
}

export function totalPages(sessionCount: number, slotCount: number): number {
	if (slotCount <= 0) {
		return 1;
	}
	return Math.max(1, Math.ceil(Math.max(0, sessionCount) / slotCount));
}

export function clampPage(page: number, sessionCount: number, slotCount: number): number {
	return Math.min(Math.max(0, Math.trunc(page)), totalPages(sessionCount, slotCount) - 1);
}

export function sessionIndex(page: number, slotCount: number, slotOrdinal: number): number {
	return Math.max(0, Math.trunc(page)) * Math.max(0, slotCount) + Math.max(0, slotOrdinal);
}

export function wrappedPage(
	page: number,
	direction: -1 | 1,
	sessionCount: number,
	slotCount: number,
): number {
	const pageCount = totalPages(sessionCount, slotCount);
	return (clampPage(page, sessionCount, slotCount) + direction + pageCount) % pageCount;
}
