# Local dynamic proxy

The ES target is **not fixed anywhere on the server**. The user types it in
the UI (or via `?base_uri=`), and the browser sends it per request to the
local proxy:

```
Browser ──► http://localhost:9100/es/*  + header  X-ES-Target: <user-typed base URI>
            (same origin, so no CORS)
              │
              ▼
        local proxy (this dir / grunt connect middleware)
              │  forwards to X-ES-Target, adds CORS headers, handles OPTIONS
              ▼
        Elasticsearch  <user-typed, e.g. http://192.168.1.10:9200 or
                       https://es.example.com:443/prefix>
```

## Run

* `npm run start` — grunt connect on :9100 with the proxy middleware built in.
* `npm run proxy` — standalone server (same `:9100`, serves `_site/` + proxy).
  Env: `PORT` (default 9100), `ES_PROXY_HOST` (default 127.0.0.1).

Both are equivalent; `grunt server` is what the Docker images use.

## Debugging with curl

```bash
curl -i http://localhost:9100/es/_cluster/health \
  -H "X-ES-Target: http://localhost:9200"

# fallback query param (useful for plain scripts):
curl "http://localhost:9100/es/_cluster/health?es_target=http%3A%2F%2Flocalhost%3A9200"
```

## Notes / safety

* Only `http:`/`https:` targets are accepted; a scheme-less value
  (`localhost:9200`) gets `http://` prepended.
* The proxy listens on loopback by default for the standalone mode. The
  grunt connect server binds `0.0.0.0:9100` (as before) — it can therefore
  reach any http(s) host reachable from that machine. Do not expose it
  publicly.
* A non-2xx proxy reply does not crash the server: missing/invalid target
  → `400 es_proxy_missing_target`, unreachable upstream → `502
  es_proxy_upstream_unreachable` (JSON, UI shows it in the header).
