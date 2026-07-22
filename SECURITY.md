# Security policy

## Supported version

Security fixes are applied to the latest revision on the default branch. Self-hosters should update the application and its container dependencies regularly.

## Reporting a vulnerability

Please do not disclose a suspected vulnerability in a public issue. Use GitHub's private vulnerability reporting feature for this repository. Include the affected route or component, reproduction steps, impact, and any suggested mitigation. Avoid including real archive data, credentials, OAuth tokens, pairing invitations, media, or database files.

## Deployment boundary

The Master List is a personal, single-owner application. Use HTTPS for any internet-accessible deployment, keep the data directory private, and prefer a private VPN such as Tailscale or WireGuard. Peer pairing should only be performed with an instance and operator you trust.
