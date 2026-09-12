# Workspace machine selection

The Add workspace dialog selects a machine before a directory. Local selection
opens a native directory chooser on the machine running Pi Web (macOS
AppleScript, Windows FolderBrowserDialog, Linux zenity). A manual path remains
available when a desktop chooser is unavailable or cancelled.

`GET /api/workspace-machines` lists concrete aliases from `~/.ssh/config`,
including Include files, plus Web UI hosts. Pattern-only Host entries are not
selectable. OpenSSH itself resolves connection settings such as ProxyJump,
IdentityFile, User and Port; the UI does not reinterpret those settings.

Web UI hosts live in `.topcard/remote-hosts.json`, written atomically with
mode 0600 and serialized across requests/HMR. Settings can add, edit and delete
these hosts; imported SSH entries are read-only. A deleted host fails explicitly
when an existing workspace references it.

Connections use OpenSSH multiplexing. The directory browser and all existing
remote Pi tools use the same control socket, whose identity includes connection
settings. Passwords and key passphrases travel through a temporary private Unix
socket to SSH_ASKPASS; they are not written to disk, environment variables,
command-line arguments, or workspace metadata. Unknown host keys require the
user to confirm the exact OpenSSH fingerprint prompt before it is accepted;
changed known keys remain blocked. Idle authenticated connections persist for
up to eight hours; after expiry, select the machine again to authenticate.

Remote directory completion uses the typed path's parent and basename prefix.
NUL-delimited names preserve spaces and newlines. Requests are debounced and
aborted on path or machine changes. Selecting the directory still passes through
workspace_create's SSH directory validation, and the existing SSH tool extension
runs filesystem and shell tools remotely. Pi itself and third-party extensions
continue to run locally.

Validation:

- `node --test lib/remote-hosts.test.mjs lib/ssh-workspace.test.mjs lib/settings-navigation.test.mjs`
- `node e2e/workspace-machines.mjs` against the dev server. This uses transport/API
  fixtures for password entry, directory completion, native chooser dispatch and
  the workspace save payload; it does not authenticate against a user's server.
- `node_modules/.bin/tsc --noEmit`
- `npm run lint`
