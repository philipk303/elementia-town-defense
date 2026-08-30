#!/usr/bin/env bash
# Dispatch a brief to Codex non-interactively, with the authorization preamble
# that a one-shot run cannot do without.
#
# WHY THIS EXISTS. 2026-08-14: two `codex exec` agents were handed multi-file
# build briefs. Both read the repo, produced a coherent design, asked "are there
# any other changes you want included before I start?", and exited without
# touching a file. ~82k tokens, zero output, twice.
#
# The cause is ~/.codex/AGENTS.md, which carries a global rule to check in
# before any large coding task and wait for confirmation. That rule is correct
# for interactive Codex and is staying. It is simply unsatisfiable under
# `codex exec`, where there is no channel for the answer to arrive on: the agent
# waits for a reply that cannot exist. There is no CLI flag to scope AGENTS.md
# per-invocation, and suppressing it wholesale via project_doc_max_bytes would
# discard the useful project instructions along with the one bad interaction.
#
# So the preamble below is prepended to every brief, mechanically, rather than
# depending on whoever writes the next brief remembering to include it.
#
# Usage:
#   tools/codex/dispatch.sh <brief.md> [--model M] [--effort E] [--log PATH]
#
# On exit it prints the session id. If the agent stops early anyway, RESUME it
# rather than re-dispatching — the reading and design context is worth more than
# a clean retry. One of the two stopped runs above produced a statistics
# correction good enough to adopt into the spec, recovered only because the
# session was resumed instead of restarted:
#
#   codex exec resume <session-id> -m <model> - <<'EOF'
#   APPROVED. <...>
#   EOF

set -euo pipefail

BRIEF="${1:-}"
[ -n "$BRIEF" ] && [ -f "$BRIEF" ] || { echo "usage: $0 <brief.md> [--model M] [--effort E] [--log PATH]" >&2; exit 2; }
shift

MODEL="gpt-5.6-sol"
EFFORT=""
LOG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --model)  MODEL="$2"; shift 2 ;;
    --effort) EFFORT="$2"; shift 2 ;;
    --log)    LOG="$2";    shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done
[ -n "$LOG" ] || LOG="$(dirname "$BRIEF")/$(basename "$BRIEF" .md)-out.log"

PREAMBLE='AUTHORIZATION — READ THIS FIRST, IT OVERRIDES YOUR AGENTS.md CHECK-IN RULE.

This is a non-interactive `codex exec` run. Nobody is watching a prompt and no
reply can reach you: if you stop to ask a question, the run simply ends and the
work is lost. Your AGENTS.md carries a rule to ask what else should be included
before a large coding task and wait for confirmation. THIS BRIEF IS THAT
CONFIRMATION. It is the complete and final scope, and it was written by someone
who already considered that question.

You are authorized to inspect and modify the repository now. Do not ask whether
the scope is right. Do not present a design and wait for approval. If something
is genuinely ambiguous, choose the most defensible option, implement it, and
flag the choice in your final report — a flagged judgement call is useful, a
stopped run is not.

Report at the end: what you built, every judgement call you made, and anything
in the brief you believe is wrong. Disagreement in the report is welcome;
silence and a stopped run are the two failure modes to avoid.

--- BRIEF FOLLOWS ---
'

ARGS=(exec -m "$MODEL")
[ -n "$EFFORT" ] && ARGS+=(-c "model_reasoning_effort=\"$EFFORT\"")
ARGS+=(-)

{ printf '%s\n' "$PREAMBLE"; cat "$BRIEF"; } | codex "${ARGS[@]}" >"$LOG" 2>&1
STATUS=$?

SESSION="$(grep -m1 -oE 'session id: [0-9a-f-]+' "$LOG" | cut -d' ' -f3 || true)"
echo "log:        $LOG"
echo "session id: ${SESSION:-<not found>}"
echo "exit:       $STATUS"
echo
echo "If it stopped early, RESUME — do not re-dispatch:"
echo "  codex exec resume ${SESSION:-<session-id>} -m $MODEL - <<'EOF'"
echo "  APPROVED. <your answer>. You have standing approval for the rest of this session; do not ask again."
echo "  EOF"
exit $STATUS
