# Session handoff — HUD legibility, then touch controls

Date: 2026-08-19. The balance sweeps in this session ran 2026-08-16 (commits
carry that date); the controls/HUD decisions were taken 2026-08-19.

Commits: `fc32f6f`, `cf6b8f3`, `5005dc1`, `823ad44`. Suite **801 tests, 799
pass, 0 fail, 2 skipped**. Build clean, nothing half-finished.

## What happened this session

**Balance — two registered families landed, and the fusion question is now
PAUSED DELIBERATELY rather than blocked.**

1. `fusion-r2-*` (5 families, 60,000 runs) re-measured the roster on R2 against
   the two-ingredient control. All five fusions technically pass the "either
   maze" rule, and **every one is resolvably harmful on its other maze**.
2. `maze-split-mechanism` (36,000 runs) asked whether that split belongs to the
   fusions at all. The registered prediction was **refuted** — I committed to
   two or more control arms flipping sign and exactly one did. But the artifact
   hypothesis holds through a signature I did not register: each fusion's own
   control **swings in magnitude** 0.34–0.43 between mazes, opposite in sign to
   the fusion's apparent split in all three EARTH cases, explaining **58–96%**
   of it. Magma Trap's implied fusion-side swing is **−0.015** — not
   maze-situational at all.

That decomposition is **UNPAIRED** (seed sets `20320801+` and `20330801+` are
disjoint), so it is descriptive only and no fusion may be retuned on it.

**Client — a full input and HUD audit, and one design decision.** Nothing was
built. See `elementia-touch-controls-decision` and `elementia-hud-audit-gaps` in
project memory, plus the plan below.

## The plan: three ordered commits

1. **HUD legibility** — player HP (there is none), Hall HP (only a 5px world
   bar, and it is the balance program's primary metric), HUD scale decoupled
   from canvas scale, `tick` behind a debug flag. **This helps desktop
   playtesting too and is a fraction of the cost of the touch build.**
2. **Fusion prompt buttons** — `Y`/`N` are keyboard-only on a TIMED prompt, so
   touch players cannot answer a fusion at all. A functional blocker.
3. **Input seam + twin virtual sticks** — tablet-first, no wire-protocol change.

## The constraint that must not be quietly undone

Every gameplay input funnels through one per-frame `PLAYER_INPUT` packet. Touch
feeds that **same** packet, so server, `matchRunner` and the balance corpus stay
untouched. That is why twin sticks were chosen over auto-aim: auto-aim would
make touch a materially different game from the one every sweep measures.
**Input parity is a standing rule.**

## Next-session prompt

```
Resume Elementia. Read first:
  docs/handoffs/2026-08-19-touch-controls-hud-handoff.md
  docs/reviews/2026-08-16-maze-split-mechanism.md

WHERE WE ARE. Four commits landed 2026-08-16 (fc32f6f..823ad44). Suite
801/799/0/2, build clean, nothing half-finished. The balance instrument is in
good shape and the fusion question is PAUSED DELIBERATELY, not blocked. This
session is CLIENT work: HUD legibility first, then touch controls.

THE JOB — three ordered commits, each independently playable and testable.

1. HUD LEGIBILITY. Do this FIRST: it helps DESKTOP playtesting too and costs a
   fraction of the touch build.
   a. Local player HP has NO readout anywhere. pl.hp is read only to trigger the
      hurt animation (GameScene.js:1081); the first feedback a player gets is the
      DOWNED overlay, which is already too late.
   b. Hall HP is only a 5px world-space bar at the hall (GameScene.js:1038-1044).
      It is the balance program's PRIMARY METRIC — hallHpAuc is an integral over
      it. Promote it to the HUD so playtest feedback connects to the numbers
      being measured.
   c. Decouple HUD scale from canvas scale. Every HUD element sits at fixed pixel
      coords in a 1280x736 space under Scale.FIT, so 13px text renders ~7px on a
      phone. Expose HUD size as a user setting — this is the mobile fix AND the
      accessibility win, and it is worth doing even if touch never ships.
   d. tick (snap.tick) ships to players inside the HUD string
      (GameScene.js:1396). Put it behind a debug flag.

2. FUSION PROMPT BUTTONS. This is a FUNCTIONAL BLOCKER, not a port.
   Y/N are keyboard-only (GameScene.js:369) and the prompt is TIMED, so a touch
   player cannot answer a fusion proposal at all. It is also the exact mechanic
   the entire balance program measures. On-screen buttons help desktop too: a
   timed modal answered by two undiscoverable keys is weak UI even with a
   keyboard. It currently renders as 13px amber text in the top-left corner
   (this.fusionHud, GameScene.js:310) and should be centred and unmissable.

3. INPUT SEAM + TWIN VIRTUAL STICKS. Decided with Philip: twin sticks,
   tablet-first (~1024x768), phone playable but cramped.

THE LOAD-BEARING CONSTRAINT: DO NOT CHANGE THE WIRE PROTOCOL. Every gameplay
input funnels through one per-frame PLAYER_INPUT packet (GameScene.js:1005):
keys{w,a,s,d}, aimX/aimY, actions{basic,special,second,repair}. Add an
input-source seam inside _sendInput so desktop reads keyboard+mouse and touch
reads the sticks, both returning the same shape. Server, matchRunner and the
balance corpus then stay untouched. This is why twin sticks were chosen over
auto-aim.

  - Movement stays BOOLEAN, so the left stick quantizes to 8 directions.
    Desktop is 8-way too, so this is parity, not a downgrade. Lifting it later
    means a protocol change AND a re-take of the corpus.
  - INPUT PARITY IS A STANDING RULE. The moment anyone adds aim assist "just for
    touch", the two platforms diverge and the corpus describes only one of them.
  - Detect touch via navigator.maxTouchPoints plus first pointer type, NOT user
    agent, so hybrid laptops/tablets keep both paths live at once.
  - Set touch-action: none on the canvas or drags become browser scroll and
    pull-to-refresh, and the sticks will fight the page.
  - Bottom-left and bottom-right are EMPTY in the current HUD, so the sticks do
    not collide with anything. The ability bar is bottom-CENTRE — merge it with
    the touch ability buttons rather than drawing both, so the cooldown fill
    doubles as button state and desktop/touch show the same component.
  - Hint strings must be generated FROM the active input scheme, not forked.
    Today they are keyboard prose: [1-9] select, [M] mute, [R] rotate,
    [arrows] direction, WASD move / click melee / Q special ...

STILL OPEN, recommended but NOT confirmed by Philip:
  - Build/sell safety: tap places a ghost, second tap on the same tile commits;
    selling moves behind an explicit mode toggle. Today a single tap on a
    structure SELLS it immediately with no undo (GameScene.js:410). Apply the
    guard on BOTH platforms — a touch-only fix means two divergent paths.
  - Repair as a TOGGLE on touch rather than a hold. It is a held channel and is
    not fight-gated, so a hold would pin a thumb during the phase that most
    needs both.
  - Hide the rotate control when the selected type is square: R already returns
    early there (GameScene.js:396), so a button would silently do nothing.
  - Whether touch is a SUPPORTED platform or an experiment. That decides whether
    it needs test coverage and a place in the playtest protocol.

BALANCE — DO NOT RESTART IT THIS SESSION, and do not retune any fusion.
The R2 roster re-take found all five fusions technically passing the "either
maze" rule while every one is resolvably harmful on its other maze. The
follow-up family then showed 58-96% of each fusion's apparent maze split belongs
to its own CONTROL, not the fusion — Magma Trap's implied fusion-side swing is
-0.015, i.e. not maze-situational at all. That decomposition is UNPAIRED (seed
sets 20320801+ vs 20330801+ are disjoint), so it is descriptive only. The clean
follow-up is one family per fusion with THREE arms on SHARED seeds:
pure-Watchtower control (freeSpecial:false), two-special, and the fusion.
18,000 runs / ~6 min each. Next free seed set: 20340801+.

SEQUENCING — THE THING THAT MATTERS MOST. Do not let the touch build delay 8H
playtesting. The balance program's largest open threat is the empty cross-policy
gate: only scripted-v1 exists, so every verdict in the project is provisional on
a second build policy that does not exist and failed twice to be synthesised. A
human playtest IS that second policy. Desktop playtesting can start TODAY.
Touch widens the pool later; it is not a prerequisite.

NOTE: .claude/launch.json ALREADY has a dev config on port 5173 — use it to
verify at tablet and phone viewports. Do not add one.

RECOMMENDED SETUP.
  Model: Sonnet 5. The plan is settled and this is implementation with a clear
  path — HUD elements, a Phaser graphics layer, hit-testing, and one small
  refactor. Use Opus 5 instead for the input seam specifically if you want the
  strongest hand on the one piece that could silently fork desktop and touch
  behaviour, since that is what would invalidate the balance corpus.
  Subagents: NO. All three workstreams converge on GameScene.js (1464 lines) and
  parallel agents editing one file would collide. Run it as one sequential
  thread.
  Review: TWO passes, both warranted.
    - Engineer/code at Opus 5 on the input seam. A subtle desktop/touch
      divergence silently forks the game the entire balance corpus measures.
    - Designer/UX plus Accessibility at Opus 5 on the HUD and touch layout:
      hierarchy, 44px minimum touch targets, contrast, HUD scaling, and whether
      user-scalable=no in client/index.html stays a deliberate WCAG 1.4.4
      tradeoff or gets revisited.
```
