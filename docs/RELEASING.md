# Releasing

The release workflow publishes versioned Linux AMD64 and ARM64 images to GitHub Container Registry (GHCR), then creates a GitHub release with generated notes. It runs only for semantic version tags such as `v0.1.0` and cannot publish until the reusable CI workflow passes.

After CI and tag validation, the two container architectures build concurrently on native GitHub-hosted runners: AMD64 uses `ubuntu-24.04` and ARM64 uses `ubuntu-24.04-arm`. Each job pushes an immutable image digest with an architecture-specific cache scope. A final job downloads those digests, assembles the tagged multi-architecture manifest, verifies that both platforms are present and only then creates the GitHub release. This avoids the substantially slower QEMU-emulated ARM build used by the original single-runner workflow.

## Continuous integration

Pull requests and branch pushes run three independent checks:

- **Full regression tests** installs the lockfile with the repository's pinned Node version and runs `npm test`, including listener-based API tests.
- **Production dependency audit** runs `npm audit --omit=dev` separately so dependency failures are visible.
- **Docker build and instance-transfer smoke test** builds the production image and exercises two restricted containers. It creates the source owner and show, stores media, downloads privacy-safe diagnostics, exports the full instance, imports it into a clean target, restarts and signs in with the imported owner.

The local pre-commit hook intentionally runs `npm run test:unit`. This keeps local commits independent of network-listener permissions while CI remains the authoritative full-suite environment.

Configure the default-branch ruleset to require these checks before merging:

- `Full regression tests`
- `Production dependency audit`
- `Docker build and health check`

## Publish a release

1. Confirm `main` is clean, pushed, and green in GitHub Actions.
2. Update `version` in `package.json` and `package-lock.json`. The workflow rejects a tag that does not exactly match this version.
3. Commit and push the version change.
4. Create and push an annotated tag:

   ```sh
   git tag -a v0.2.0 -m "The Master List v0.2.0"
   git push origin main v0.2.0
   ```

5. Watch the **Release** workflow. After CI passes, it publishes these GHCR tags:

   - `v0.2.0`
   - `0.2.0`
   - `0.2`
   - `latest` for stable versions

Pre-release versions containing a hyphen do not replace `latest`.

After the first publication, open the package settings on GitHub and make `ghcr.io/joshtrim/themasterlist` public. Confirm it remains linked to this repository so the workflow's `GITHUB_TOKEN` retains package access.

Verify the release without relying on a local build:

```sh
docker pull ghcr.io/joshtrim/themasterlist:v0.2.0
docker buildx imagetools inspect ghcr.io/joshtrim/themasterlist:v0.2.0
```

The manifest must list both `linux/amd64` and `linux/arm64`. An anonymous `docker pull` must work after package visibility is public, and `/api/healthz` should report the tagged application version.

## Install or upgrade

Compose defaults to the published `latest` image:

```sh
docker compose pull
docker compose up -d --no-build
docker compose ps
```

For repeatable deployments, set a specific tag in `.env`:

```env
MASTER_LIST_VERSION=v0.2.0
```

Create an in-app database backup before upgrading. The `./data` bind mount is not replaced by image pulls or container recreation.

## Roll back

Select the last known-good release in `.env`, then recreate the container without rebuilding:

```sh
docker compose pull
docker compose up -d --no-build
docker compose ps
```

Application schema migrations are designed to be forward compatible, but retain the pre-upgrade backup until the rollback has been verified.
