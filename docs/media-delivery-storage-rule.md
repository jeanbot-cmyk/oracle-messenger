# Oracle Messenger Media Delivery Storage Rule

This rule is mandatory for every exchanged file: images, videos, documents, audio files, voice notes, and any message attachment.

## Required State Flow

```text
UPLOADED -> DELIVERED -> DOWNLOADED -> LOCALLY_SAVED -> ACK_CONFIRMED
```

The server must keep the original temporary media while the recipient has not confirmed a local usable copy on their phone.

## Deletion Rule

Server-side deletion is allowed only after:

- the recipient is identified;
- the exact message/file id matches;
- the file was fully transferred;
- the destination client completed the download;
- the file exists in local Android storage;
- the local save was acknowledged by the client;
- the server recorded `LOCALLY_SAVED + ACK_CONFIRMED`.

If any condition is missing, the server keeps the file.

## Current Implementation Guard

`ChatService.markMediaSavedLocally()` records the client ACK and deliberately returns `serverRetained: true`. It must not clear `Message.content` or delete the uploaded file from disk during this step.

The native Android client downloads received media to app storage, verifies that the file exists, computes a checksum, then calls `POST /messages/:id/media-local-save`.

## Not Allowed

- Do not delete media because the sender uploaded it.
- Do not delete media because a notification was sent.
- Do not delete media because metadata or a thumbnail was delivered.
- Do not delete media after a partial download.
- Do not delete media while the recipient is offline, the app is closed, storage is full, permission is missing, or no reliable ACK was received.

## Remaining Work

The full migration still needs a dedicated per-recipient delivery table or equivalent event model to persist every intermediate state (`DELIVERED`, `DOWNLOADED`, `LOCALLY_SAVED`) before final `ACK_CONFIRMED`.
