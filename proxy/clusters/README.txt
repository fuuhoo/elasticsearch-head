Legacy (pre-2026) per-cluster config. The proxy is now dynamic: the ES target
is supplied per-request by the UI as X-ES-Target, so no per-cluster files are
needed. These files are kept only for reference and are no longer loaded.
