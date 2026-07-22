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

Ratings, favourites, memories and matching media assignments remain attributable to each instance. Media manifests sync; original uploaded files are not automatically copied between servers.

## Conflicts

If both instances modify a shared show after their last common sync, open **System → Conflicts**. The owner can keep either version or merge notes, ratings, setlists and media assignments field by field.

Use **System → Activity** to review received shared shows and other peer notifications.

## Remove a peer

Removing a peer stops future synchronization but does not automatically erase contributions already incorporated into shared shows. Review shared records before deleting a connection if that distinction matters for your archive.
