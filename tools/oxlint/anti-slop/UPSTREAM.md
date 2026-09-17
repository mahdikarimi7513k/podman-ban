# Upstream provenance — anti-slop vendored plugin

- Source repository: https://github.com/dmmulroy/anti-slop.git
- Installed via: `npx skills add dmmulroy/anti-slop --skill install-anti-slop`
  (skill hash: d92d8dbdf1bd96e11ee33945dca76306179a7c415e7339769084b2c211c6897c)
- Installed path: `tools/oxlint/anti-slop/` (entry: `index.ts`)
- Upstream revision: unknown (installed non-interactively, no git metadata kept) — not guessed per skill rules.
- Vendored license/provenance kept: `vendor/eslint-stylistic/LICENSE`,
  `vendor/eslint-stylistic/UPSTREAM.md`.
- Oxlint companion deps (pinned exact): `oxlint@1.82.0`, `@oxlint/plugins@1.82.0`
  (devDependencies in root `package.json`; Effect plugin NOT enabled — no
  direct `effect` dependency in the repo).
- Intentional deviations: none (fresh install, default generic rules at
  `"error"` in `.oxlintrc.json`).
