# Security

Please report a security issue privately to the repository owner through GitHub's private
vulnerability reporting feature. Do not include credentials, source code, or private session data in
a public issue.

Supported releases receive security fixes on the latest published version.

The plugin intentionally:

- invokes `sc` and optional `gh` with argument arrays rather than through a shell;
- never requests or stores GitHub credentials;
- never uses forced worktree deletion;
- uses only public Stream Deck SDK APIs; and
- does not download or execute code at runtime.
