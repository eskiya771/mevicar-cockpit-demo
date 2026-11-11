# Validated MeviTV player

This directory contains the exact source-built Movi JS/WASM pair accepted
in the real MeviTV MKV seek test. It is the official default player.

- Upstream: https://github.com/MrUjjwalG/movi-player/tree/8bd0b50d7cdfcef635e015ea93e365876088969d
- MeviCar build sources and patches: https://github.com/eskiya771/mevicar-cockpit-demo/tree/3bad8175e2c12774389bec047d29468fc1c18dc0
- Build workflow: https://github.com/eskiya771/mevicar-cockpit-demo/actions/runs/43005124132
- Integrity and source provenance: `movi-build.json`
- Upstream licensing: `LICENSE.txt`

Generated JS and WASM are byte-preserved by .gitattributes. Do not edit the
generated files. Rebuild from the pinned upstream and both recorded patches,
verify the pair, and promote a new versioned directory for future changes.
Run `node tests/movi-official-smoke.mjs` before shipping.
