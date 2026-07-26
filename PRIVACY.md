# Privacy

super.engineering for Stream Deck runs entirely on the user's Mac and does not include telemetry,
analytics, advertising, crash reporting, or a remote service operated by the plugin author.

The plugin:

- reads session metadata from the locally installed `sc` command;
- asks macOS to open the locally installed super.engineering App;
- optionally invokes the locally installed GitHub CLI to read pull request check status;
- stores only the plugin paths and fallback refresh interval in Stream Deck global settings; and
- writes diagnostic logs using Stream Deck's standard local, rotating plugin log facility.

The plugin does not transmit session titles, paths, diffs, prompts, source code, or usage data to the
plugin author. When GitHub CLI integration is enabled, GitHub CLI communicates with GitHub under the
user's existing authentication and configuration; the plugin never reads or stores GitHub tokens.

Uninstalling the plugin removes its Stream Deck settings and local plugin logs according to Stream
Deck's normal uninstall behavior.

Last updated: July 23, 2026.
