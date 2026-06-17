# Harness Readiness Notes

The F-46+ feature graph assumes all CF-* foundation features are DONE before Check | Rules work begins.

Required completed dependencies:
- CF-02
- CF-04
- CF-07
- CF-08

The new product direction is Check | Rules only.

Do not implement:
- saved spots
- reminders
- notifications
- push
- background monitoring
- alert mode

The verifier runs:
- npm test
- npm run typecheck
- npm run build when required data files exist

npm run build is skipped only when required data files such as data/latest.json are absent.

Prototype images live under:
docs/prototypes/

UI specs use written requirements as authoritative and prototype images as visual reference only.
