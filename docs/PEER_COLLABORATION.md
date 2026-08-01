# Peer collaboration

The Master List uses one owner account per installation. Friends do not create accounts on your server; each person runs an instance and the instances exchange contributions to shows they attended together.

## Requirements

- Both instances must be reachable over a trusted LAN, VPN or HTTPS address.
- Each `APP_ORIGIN` must describe the address its owner and peers actually use.
- Pair only with people and servers you trust. Shared snapshots contain show memories, ratings and media manifests.

Loopback and link-local peer addresses are rejected. For remote collaboration, a private VPN such as Tailscale or WireGuard is preferable to exposing the app directly to the internet.

## Pair instances

1. On the instance receiving the connection, open **System → Account** and create a pairing invite.
2. Copy the invite to the other owner through a private channel.
3. On the other instance, open **Account**, paste the invitation and accept it.
4. Test the connection from the peer list on both instances.

Invites expire after one week and can be accepted only once. Create a new invitation if pairing fails after it has already been consumed.

## Share a show

Add or edit a show and select paired attendees. The owner’s show remains in the ordinary **Shows** archive. When a connected peer syncs, their instance receives a notification and adds its contribution to the same shared show.

Ratings, favourites, memories and matching media assignments remain attributable to each instance. Media manifests sync first. Photos and videos then stream on demand from the instance that owns the file, through an authenticated local proxy; video seeking uses HTTP byte ranges. The browser never receives peer signing keys.

Remote media is labelled with its owner and remains visible in the show gallery and whole-set player. If that peer is offline, the rest of the show remains available and the media card reports its source as unavailable. For a show that also exists in your local archive, **Save local copy** creates a cancellable background job, verifies the signed manifest checksum, and then processes the copy like an ordinary upload. Files are never duplicated automatically.

Synchronization runs in the server, so both instances can exchange changes without an authenticated browser being left open. A failed peer remains paired and is retried automatically with an increasing delay, up to one hour. Restarting the app does not clear that retry state. The peer card shows the last successful sync, recent failure count, error and next retry time; **Sync now** bypasses the delay when you want to retry immediately.

Peer streaming works best over HTTPS or a private VPN. Signed requests authenticate both instances and authorize only media attached to a show shared with the requester; HTTPS or the VPN also protects the media bytes while they travel between servers.

## Conflicts

If both instances modify a shared show after their last common sync, open **System → Conflicts**. The owner can keep either version or merge notes, ratings, setlists and media assignments field by field.

Use **System → Activity** to review received shared shows and other peer notifications.

## Remove a peer

Removing a peer stops future synchronization but does not automatically erase contributions already incorporated into shared shows. Review shared records before deleting a connection if that distinction matters for your archive.
