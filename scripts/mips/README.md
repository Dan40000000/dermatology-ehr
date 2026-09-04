# MIPS qualification suite

The MIPS release checks are split into four layers so failures are easy to
localize and live-pilot writes are always explicit.

1. `npm run test:mips` runs the focused backend and frontend regression tests.
2. `npm run test:mips:release` runs the full local release gate and backup/restore regression.
3. `MIPS_UAT_CONFIRM_SYNTHETIC=1 npm run test:mips:pilot` runs the seven-scenario API UAT against the synthetic `tenant-demo` pilot.
4. `npm run test:mips:browser` checks the deterministic synthetic MIPS page with Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari, including axe, keyboard, source-link, non-submission, console, and responsive-layout checks. `npm run test:mips:browser:chromium` is the fast PR form.

Run all four layers with:

```sh
MIPS_UAT_CONFIRM_SYNTHETIC=1 npm run test:mips:qualification
```

The live check defaults to the Railway pilot URLs. Supply credentials through
`MIPS_UAT_CREDENTIALS_JSON` or a chmod-600 JSON file named by
`MIPS_UAT_CREDENTIALS_FILE`. For an intentional local run against the existing
disposable demo tenant, `MIPS_UAT_ALLOW_PILOT_PACKET=1` permits the script to
read the synthetic role credentials already documented in `PILOT_PACKET.md`.
For another controlled synthetic pilot, also set `MIPS_UAT_API_URL`,
`MIPS_UAT_FRONTEND_URL`, and `MIPS_UAT_TENANT_ID`. The credential object is
keyed by the seven role names used in the pilot packet. Never commit a private
credential file or pass its contents on a command line.

The API UAT also accepts `MIPS_UAT_PATIENT_ID` and `MIPS_UAT_ENCOUNTER_ID` when
the pilot fixture is reseeded. It deliberately refuses to run unless
`MIPS_UAT_CONFIRM_SYNTHETIC=1` and the tenant is `tenant-demo`. It creates only
synthetic itch-assessment evidence, restores access settings in a `finally`
block, and never calls an external registry or submission endpoint.

These commands qualify the software and the controlled pilot. They do not
override the HIPAA readiness gate, prove CMS measure certification, or
authorize live-PHI use or registry submission.
