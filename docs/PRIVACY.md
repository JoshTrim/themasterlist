# Privacy

The Master List is self-hosted. Show records, uploaded originals, encoded playback copies and account data remain in the configured `data` directory unless an optional integration sends specific information to an external provider.

## External requests

| Feature | Information sent |
| --- | --- |
| setlist.fm search | Artist, city and optional show date |
| Venue map lookup | Venue or address text sent to OpenStreetMap Nominatim |
| Album and profile enrichment | Artist, track or venue search terms sent to Apple, MusicBrainz, Wikipedia and optionally Google Custom Search |
| YouTube discovery | Artist, venue, date and track search terms |
| Spotify, YouTube and Apple Music export | Track titles and artist credits needed to match and create a playlist |
| AudD recognition | A 12-second MP3 sample extracted from the selected uploaded video |

Provider credentials remain server-side except for Apple Music’s browser-based MusicKit authorization. Review each provider’s terms and privacy policy before enabling it.

## OAuth credentials

Spotify and YouTube access and refresh tokens are stored in `data/connections.json`. Production requires AES-256-GCM encryption through `CONNECTIONS_ENCRYPTION_KEY`; the file also has owner-only filesystem permissions.

Encryption protects copied storage when the key is kept separately. It does not protect credentials from an attacker who controls the running server or can read both `.env` and `data`.

## Peer collaboration

Pairing shares show snapshots and contributions with the selected peer instance. These can include event details, notes, ratings, favourites and media manifests. Original local media files are not automatically transferred by peer synchronization.

Pair only with trusted operators and exchange invitations through a private channel. Invitations contain connection material and must not be posted publicly.

## Backups and exports

SQLite backups contain account password hashes, peer identity keys and archive data. Full-instance bundles also contain media and may contain encrypted OAuth connections. Portable JSON exports contain show information. Media backups can contain personal photos and videos. Store all of them as sensitive personal data and securely dispose of copies that are no longer needed. A full-instance bundle is checksummed but is not itself encrypted.
