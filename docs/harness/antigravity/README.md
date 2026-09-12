# Antigravity CLI

Executable: agy. Checked local --help / --version: 1.2.2. Resume: --conversation ID.
Registers only topcard-session-state in ~/.gemini/config/hooks.json at launch, preserving other entries. User approved this persistent configuration exception. Scripts live in TopCard data directory; hooks outside TopCard launches exit without reporting. SSH uses ~/.cache/topcard for scripts and the remote user's hook configuration.

Lifecycle follows Orca: PreInvocation starts work; Stop fullyIdle=false remains working; terminal Stop returns attention. Post-completion bookkeeping is ignored until PreInvocation. ask_question/ask_permission request attention. Hook payload conversationId provides resume identity.

No TUI/model invocation was tested. Reply previews only supported if last_assistant_message is supplied; transcript fallback and conversation title extraction are not implemented. Windows/SSH are implemented but untested.

Sources: https://antigravity.google/docs/hooks ; https://www.antigravity.google/docs/cli/plugins ; Orca local snapshot src/main/antigravity and src/shared/agent-hook-listener/providers/antigravity-*.
