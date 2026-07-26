const REFRESH_FAILURE_GRACE_MILLISECONDS = 5_000;
const REFRESH_RETRY_MILLISECONDS = 1_000;
const DEGRADED_RETRY_MILLISECONDS = 5_000;

export type RefreshFailureDecision = {
	deferError: boolean;
	failureStartedAt: number;
	retryDelayMilliseconds: number;
};

export function decideRefreshFailure(
	hasCachedSessions: boolean,
	applicationKnownOffline: boolean,
	failureStartedAt: number | undefined,
	now = Date.now(),
): RefreshFailureDecision {
	const startedAt = failureStartedAt ?? now;
	const withinGracePeriod = now - startedAt < REFRESH_FAILURE_GRACE_MILLISECONDS;
	const deferError = hasCachedSessions && !applicationKnownOffline && withinGracePeriod;

	return {
		deferError,
		failureStartedAt: startedAt,
		retryDelayMilliseconds: deferError
			? REFRESH_RETRY_MILLISECONDS
			: DEGRADED_RETRY_MILLISECONDS,
	};
}
