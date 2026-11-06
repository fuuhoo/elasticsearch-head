#!/usr/bin/env node
// Standalone local proxy server: serves _site and proxies ES API requests.
// The Elasticsearch target is NOT configured here — the UI sends it per
// request as X-ES-Target, so one server works against any cluster the
// user types in. See proxy/esProxy.js.
//   PORT=9100 ES_PROXY_HOST=127.0.0.1 node proxy/index.js
"use strict";
const { createServer } = require("./esProxy.js");
createServer();
