# Contributing

Thanks for helping improve The Master List. Bug reports, documentation corrections and focused code changes are welcome.

## Development setup

Node.js 24 is recommended. FFmpeg is needed for real media processing, but most tests use isolated fixtures.

```sh
npm ci
cp .env.example .env
npm test
npm start
```

Use test credentials and synthetic show data during development. Never commit a real `.env`, database, media file, OAuth connection, pairing invitation, API response containing personal data or local absolute path.

## Making changes

- Keep route, storage and provider logic in the existing `lib` modules rather than expanding `server.js` unnecessarily.
- Preserve the single-owner-per-instance model unless a proposal explicitly changes the architecture.
- Add regression coverage for behavior changes, especially authentication, uploads, synchronization, migrations and playback.
- Keep user-facing documentation and `.env.example` synchronized with code changes.
- Avoid destructive database migrations; existing self-hosted archives must upgrade in place.

Run before submitting:

```sh
npm run test:unit
git diff --check
```

`npm run test:coverage` provides Node’s line, branch and function report. `npm run setup:hooks` enables syntax checks and the listener-free suite before local commits.

GitHub Actions is the authoritative clean-environment check. Every pull request runs the complete `npm test` suite—including listener-based API regressions—a production dependency audit, and a Docker build that must reach the real health endpoint. Keep all three checks green before merging.

## Security reports

Do not open a public issue for a suspected vulnerability or include real credentials or archive data in a reproduction. Follow [SECURITY.md](SECURITY.md).

## Licence

Contributions are accepted under the project’s [GNU General Public License version 3](LICENSE).
