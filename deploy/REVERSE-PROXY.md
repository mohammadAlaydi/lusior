# Reverse proxy and CDN contract

The Emryn container listens on HTTP port 3001 and is deliberately bound to
loopback in `compose.yaml`. A TLS-capable reverse proxy or CDN origin is
required for public traffic. This is a vendor-neutral contract, not a
requirement to use any particular host or CDN.

## Required edge behaviour

1. Terminate HTTPS at the edge and redirect plaintext HTTP to HTTPS. Enable
   TLS 1.2+ and HSTS only after the final hostname is verified.
2. Proxy the original `Host`, scheme, and client address to Emryn. Set
   `X-Forwarded-Proto https` and a single, sanitized `X-Forwarded-For` hop.
   The container's `TRUST_PROXY` must equal the number of controlled hops.
3. Do not cache `/api/*`. Forward `GET`, `POST`, and `OPTIONS` intact; do not
   rewrite API 404s to HTML. Apply request-size and edge rate limits there.
4. Cache fingerprinted `/assets/*` responses only when successful, with
   `public, max-age=31536000, immutable`. Never cache `index.html` for longer
   than a revalidation interval, and purge it after every release.
5. Forward application routes such as `/projects/<slug>` to the container so
   the SPA shell can load. An unknown API or missing static asset must remain a
   real HTTP 404; do not use a proxy-wide "serve index.html" rewrite.
6. Preserve health probes as internal-only traffic. Do not expose
   `/api/ready` as a public monitoring endpoint unless the platform requires
   it, and never cache it.

## Generic Nginx example

`deploy/nginx/emryn.conf` is a minimal Nginx configuration fragment for a
proxy running on the same Docker host. It is illustrative: supply certificate
paths, hostname, logging, and current TLS policy in the surrounding server
configuration. It intentionally leaves WAF, DDoS protection, and global rate
limits to the selected edge/platform.

## Routing assumption

The application owns SPA route fallback after static-file lookup. The reverse
proxy must therefore pass non-API navigation requests through unchanged. When
the application is updated to distinguish known SPA routes from arbitrary
paths, preserve that server-side 404 behaviour; never hide it with an edge
rewrite.
