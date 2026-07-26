import { execFile, type ExecFileException } from "node:child_process";

export type CommandResult = {
	stderr: string;
	stdout: string;
};

export class CommandError extends Error {
	readonly executable: string;
	readonly stderr: string;

	constructor(executable: string, error: ExecFileException, stderr: string) {
		const exitDetails = [
			error.code !== undefined && error.code !== null ? `code=${error.code}` : "",
			error.signal ? `signal=${error.signal}` : "",
			error.killed ? "killed=true" : "",
		].filter(Boolean).join(", ");
		const message = stderr.trim() || error.message;
		super(exitDetails ? `${message} (${exitDetails})` : message);
		this.name = "CommandError";
		this.executable = executable;
		this.stderr = stderr;
	}
}

export function execute(
	executable: string,
	args: string[],
	options: { cwd?: string; timeoutMilliseconds?: number } = {},
): Promise<CommandResult> {
	return new Promise((resolve, reject) => {
		execFile(
			executable,
			args,
			{
				cwd: options.cwd,
				encoding: "utf8",
				maxBuffer: 4 * 1_024 * 1_024,
				timeout: options.timeoutMilliseconds ?? 10_000,
			},
			(error, stdout, stderr) => {
				if (error) {
					reject(new CommandError(executable, error, stderr));
					return;
				}

				resolve({ stderr, stdout });
			},
		);
	});
}
