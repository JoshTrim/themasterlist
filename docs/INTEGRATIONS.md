# Integrations

Every integration is optional. Add credentials to `.env`, restart the server, then check **System → API limits** or the relevant feature page.

## setlist.fm

1. Create a setlist.fm account and request an API key from the [setlist.fm API](https://api.setlist.fm/docs/1.0/index.html).
2. Set `SETLIST_FM_API_KEY` in `.env`.
3. Restart the app and search from **Add show**.

Search sends the artist, city and optional date to setlist.fm. Review the selected result before saving.

## Spotify playlist export

1. Create an application in the [Spotify developer dashboard](https://developer.spotify.com/dashboard).
2. For local use, register exactly:

   ```text
   http://127.0.0.1:3000/auth/spotify/callback
   ```

3. Set `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and `SPOTIFY_REDIRECT_URI`.
4. Restart, open a show with tracks, choose **Export playlist → Spotify**, and authorize the owner account.

For a deployed HTTPS instance, register and configure the exact HTTPS callback instead. The scheme, host, port and path must match. Spotify’s [redirect URI rules](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri) permit HTTP only for explicit loopback IP addresses and do not permit `localhost`.

## YouTube discovery and playlist export

1. Create a Google Cloud project, enable YouTube Data API v3, and configure its OAuth consent screen.
2. Create OAuth 2.0 credentials of type **Web application**.
3. Register `${APP_ORIGIN}/auth/youtube/callback`. A default local installation uses:

   ```text
   http://127.0.0.1:3000/auth/youtube/callback
   ```

4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. While the Google project is in testing mode, add the owner’s Google account as a test user.

Google requires the callback to exactly match an authorized redirect URI; its [web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) permits local loopback addresses for testing.

YouTube API quotas are controlled by Google. The **API limits** page reports usage recorded by this instance; `YOUTUBE_DAILY_QUOTA_UNITS` only tells the app what limit to display.

## Apple Music

Set `APPLE_MUSIC_DEVELOPER_TOKEN` to a valid MusicKit developer JWT and choose a storefront such as `au`. Apple Music authorization happens in the browser and requires an eligible Apple Music account.

## AudD track detection

Set `AUDD_API_TOKEN` to enable recognition. The server extracts a 12-second MP3 sample from an uploaded video and sends that sample to AudD. Automatic matches can be overridden manually in the media editor.

## Artist and venue metadata

MusicBrainz, Wikipedia, Apple search and OpenStreetMap Nominatim do not need local credentials. Optional Google Custom Search fallback requires both `GOOGLE_CUSTOM_SEARCH_API_KEY` and `GOOGLE_CUSTOM_SEARCH_ENGINE_ID`.

## OAuth token storage

Spotify and YouTube access and refresh tokens are stored in `data/connections.json`. With `CONNECTIONS_ENCRYPTION_KEY` configured, the file contains only an AES-256-GCM envelope. Existing plaintext storage is migrated automatically on the first OAuth status check.

Back up the encryption key outside `data`. To rotate it:

1. Stop the app.
2. Put the new key in `CONNECTIONS_ENCRYPTION_KEY`.
3. Put the old key in `CONNECTIONS_ENCRYPTION_KEY_PREVIOUS`.
4. Start the app, open a show with a setlist, and confirm the playlist export controls load normally.
5. Remove the previous key and restart once more.

If a refresh token is revoked by its provider, reconnect that provider from the app.
