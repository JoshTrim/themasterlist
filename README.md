# The Master List

A personal archive for the live music shows you have attended. The first release lets you log a gig, find the matching setlist on setlist.fm, and preserve the songs with your own note.

## Run it

Requires Node.js 20 or later. No packages need to be installed.

```sh
cp .env.example .env
# Add your setlist.fm API key to .env (optional until you use search)
npm start
```

Open [http://localhost:3000](http://localhost:3000).

Shows are stored locally in `data/master-list.sqlite`. On first startup, the app automatically imports an existing `data/gigs.json` archive into SQLite. The legacy JSON file is left untouched as a backup and both local data files are ignored by Git.

## setlist.fm

The app calls setlist.fm from the server, so your key is never sent to the browser. Create a free account, apply for a key, then add `SETLIST_FM_API_KEY` to `.env`. The search needs the artist, city, and date; select the correct match before saving.

setlist.fm's API is free for non-commercial use and requires its API key to be sent in the `x-api-key` header. Check its terms before changing the project scope: [API docs](https://api.setlist.fm/docs/1.0/index.html) and [terms](https://www.setlist.fm/help/terms).

## Automatic track detection

If `AUDD_API_TOKEN` is present in `.env`, uploaded videos are sent through a background recognition job. The server extracts a 12-second audio sample, sends it to AudD, and displays the detected title and artist in the media gallery. Exact title matches are automatically associated with the show setlist; unmatched results can still be assigned manually from the edit page. The token is kept server-side.

On the edit page, selecting a different setlist track—or selecting **Unassigned**—marks that media item as a manual override and preserves your choice.

## Playlist exports

Every saved show with a setlist has export buttons. Exports create **private** playlists and show the number of songs that could not be matched. The matching uses the setlist artist (or the credited cover artist) and song title.

Copy `.env.playlists.example` values into your local `.env`, complete the credentials, and restart the server. Do not commit `.env` or `data/connections.json`; the latter holds local OAuth refresh tokens.

| Service | One-time setup | What the app does |
| --- | --- | --- |
| Spotify | Create an app in the Spotify developer dashboard and add `http://127.0.0.1:3000/auth/spotify/callback` as a redirect URI. | Connect via OAuth, search each song, create a private playlist, and add matches. |
| YouTube | Enable YouTube Data API v3 in Google Cloud, create Web Application OAuth credentials, and add `http://localhost:3000/auth/youtube/callback`. | Connect via OAuth, find music videos/audio, and create a private YouTube playlist. |
| Apple Music | Apple Developer Program membership, a MusicKit identifier/key, and a signed developer token. | MusicKit asks the subscriber for permission, then creates a library playlist and adds matched catalog songs. |

The OAuth connections are local to this prototype. A future hosted version should use user accounts, encrypted token storage, and a proper callback domain.

## Shared shows (first collaboration slice)

When two people use the same hosted instance, create a profile for each person, choose your profile, then use **Share** on a gig. A shared show keeps its own attendee list and every attendee has an independent performance rating, venue rating, favourite status, and memory.

Accounts are password-protected and sign-in is required to use the API. Create the owner account on first launch; the owner can generate one-week invite links for additional people. Keep the instance behind a private network such as Tailscale until a public HTTPS deployment and per-account ownership controls are added.

## Suggested next increments

1. Add accounts and cloud storage so the archive is available on every device.
2. Add a review screen for ambiguous song matches before each export.
3. Add photos, ratings, support acts, and filtering by artist, venue, city, or year.
