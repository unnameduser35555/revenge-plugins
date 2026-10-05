# Local Message Editor for Revenge Next

A client-side-only Revenge Next plugin that temporarily overrides the display of Discord messages.

## Behavior

- Edits are **local to this Discord client**.
- The plugin never calls Discord's message-edit or message-delete REST actions.
- Overrides are kept only in JS memory (`Map` / `Set`).
- Stopping the plugin clears everything.
- Restarting Discord/Revenge clears everything automatically.
- Long-pressing a message component that exposes Discord's normal `onLongPress` opens the local editor.
- Saving changes only the local rendered message object.
- Deleting hides the local message without deleting the server message.

## Install into the official Revenge plugin template

Copy this folder into:

```text
plugins/local-message-editor/
```

Then build the template with its normal command:

```bash
./gradlew packageLocalMessageEditor
```

The official template uses a JS entry file under `js/` and packages the generated bundle as a plugin ZIP.

## Important compatibility note

Revenge Next's Discord internals are experimental and can change. This plugin deliberately uses the official Revenge Next patcher and React runtime instead of hard-coded Discord REST calls, but the message component prop shape can still change between Discord builds.

The plugin is intentionally memory-only: it does not use Revenge's persistent storage APIs.
