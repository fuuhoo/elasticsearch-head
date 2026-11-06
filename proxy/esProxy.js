"use strict";

const httpProxy = require("http-proxy");
const { URL } = require("url");

const PROXY_PREFIX = "/es/";
const PROXY_PREFIX_NO_SLASH = "/es";
const TARGET_HEADER = "x-es-target";
const TARGET_QUERY = "es_target";

function normalizeTarget(raw) {
	if (!raw || typeof raw !== "string") return null;
	let value = raw.trim();
	if (!value) return null;
	// A user may paste `localhost:9200` without a scheme.
	if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) {
		value = "http://" + value;
	}
	let parsed;
	try {
		parsed = new URL(value);
	} catch (_) {
		return null;
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
	if (!parsed.hostname) return null;
	// Remove a trailing slash from the *target* itself the same way the UI does
	// before concatenation; the request path is appended separately.
	parsed.pathname = parsed.pathname.replace(/\/+$/, "");
	return parsed.toString().replace(/\/$/, "");
}

function resolveTarget(req) {
	const header = req.headers && req.headers[TARGET_HEADER];
	if (header) {
		const decoded = normalizeTarget(String(header).trim());
		if (decoded) return decoded;
	}
	// Fallback for plain fetch/curl debugging: /es/_cluster/health?es_target=http%3A%2F%2Flocalhost%3A9200
	try {
		const url = new URL(req.url || "/", "http://localhost");
		const queryTarget = url.searchParams.get(TARGET_QUERY);
		if (queryTarget) return normalizeTarget(queryTarget);
	} catch (_) {
		// req.url can be an absolute URI in proxy-style requests; ignore here.
	}
	return null;
}

function isProxyPath(pathname) {
	return pathname === PROXY_PREFIX_NO_SLASH || pathname.indexOf(PROXY_PREFIX) === 0;
}

function setCorsHeaders(res) {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS, HEAD");
	res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-ES-Target");
	res.setHeader("Access-Control-Max-Age", "86400");
}

function sendJson(res, status, payload) {
	if (res.headersSent) return;
	setCorsHeaders(res);
	res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(payload));
}

// One shared proxy instance: the real target is chosen per request, which is
// the whole point — the proxy must NOT bake in a fixed cluster address.
const proxy = httpProxy.createProxy({ secure: false, timeout: 30000, proxyTimeout: 30000 });

proxy.on("error", function(err, req, res) {
	const target = (req && req.__esTarget) || "unknown";
	// eslint-disable-next-line no-console
	console.error("[es-proxy] upstream error for %s: %s", target, err && err.message ? err.message : err);
	if (res && !res.headersSent) {
		sendJson(res, 502, {
			error: "es_proxy_upstream_unreachable",
			reason: "Could not reach Elasticsearch at " + target,
		});
	} else if (res && typeof res.end === "function") {
		res.end();
	}
});

function proxyRequest(req, res, resolvedTarget) {
	const target = resolvedTarget || resolveTarget(req);
	if (!target) {
		sendJson(res, 400, {
			error: "es_proxy_missing_target",
			reason: "Send X-ES-Target: http://host:port (or ?es_target=...) for the Elasticsearch base URI to proxy to.",
		});
		return;
	}
	req.__esTarget = target;
	// http-proxy picks the host from `target`, not from req.url, so leave
	// req.url as the real ES path (prefix stripped by the middleware below).
	proxy.web(req, res, { target: target });
}

// Connect/Express-style middleware so it can be dropped into grunt-contrib-connect.
// `next()` is invoked for anything that is not under /es/.
function createMiddleware() {
	return function esProxyMiddleware(req, res, next) {
		if (!req.url || !isProxyPath(req.url)) return next();

		setCorsHeaders(res);
		if (req.method === "OPTIONS") {
			res.writeHead(200);
			res.end();
			return;
		}

		const originalUrl = req.url;
		// Resolve the target from the ORIGINAL url first (header or ?es_target=),
		// then strip both the /es prefix and our routing param before forwarding.
		const target = resolveTarget(req);
		if (!target) {
			sendJson(res, 400, {
				error: "es_proxy_missing_target",
				reason: "Send X-ES-Target: http://host:port (or ?es_target=...) for the Elasticsearch base URI to proxy to.",
			});
			return;
		}
		let stripped = originalUrl.slice(PROXY_PREFIX_NO_SLASH.length);
		if (stripped.charAt(0) !== "/") stripped = "/" + stripped;
		try {
			const u = new URL(stripped, "http://localhost");
			u.searchParams.delete(TARGET_QUERY);
			stripped = u.pathname + (u.search || "");
		} catch (_) { /* leave stripped unchanged */ }
		req.url = stripped;
		proxyRequest(req, res, target);
	};
}

// Standalone server mode (npm run proxy): serve _site and proxy in one process.
// This is the user-friendly local setup — no CORS fiddling, no second terminal.
function createServer(options) {
	const opts = options || {};
	const port = Number(opts.port || process.env.PORT || 9100);
	const hostname = opts.hostname || process.env.ES_PROXY_HOST || "127.0.0.1";
	const path = require("path");
	const fs = require("fs");
	const http = require("http");

	const root = path.resolve(__dirname, "..", "_site");
	const middleware = createMiddleware();
	const contentTypes = {
		".html": "text/html; charset=utf-8",
		".js": "application/javascript; charset=utf-8",
		".css": "text/css; charset=utf-8",
		".json": "application/json; charset=utf-8",
		".png": "image/png",
		".gif": "image/gif",
		".svg": "image/svg+xml",
		".ico": "image/x-icon",
		".woff": "font/woff",
		".woff2": "font/woff2",
		".ttf": "font/ttf",
		".eot": "application/vnd.ms-fontobject",
	};

	const server = http.createServer(function(req, res) {
		middleware(req, res, function() {
			// Static files under _site (path traversal guarded).
			let urlPath = (req.url || "/").split("?")[0];
			try {
				urlPath = decodeURIComponent(urlPath);
			} catch (_) {
				/* keep raw */
			}
			if (urlPath === "/" || !path.extname(urlPath)) urlPath = "/index.html";
			const filePath = path.normalize(path.join(root, urlPath));
			if (filePath.indexOf(root) !== 0) {
				sendJson(res, 403, { error: "forbidden" });
				return;
			}
			fs.readFile(filePath, function(err, data) {
				if (err) {
					res.writeHead(404);
					res.end("Not found");
					return;
				}
				res.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
				res.end(data);
			});
		});
	});

	server.listen(port, hostname, function() {
		// eslint-disable-next-line no-console
		console.log("elasticsearch-head at http://%s:%s/  (proxy target supplied per-request by the UI)", hostname, port);
		if (hostname === "0.0.0.0" || hostname === "::") {
			// eslint-disable-next-line no-console
			console.warn("WARNING: proxy is listening on all interfaces. The per-request X-ES-Target proxy can reach any http(s) host reachable from this machine — do not expose it publicly.");
		}
	});
	return server;
}

module.exports = {
	PROXY_PREFIX: PROXY_PREFIX,
	TARGET_HEADER: TARGET_HEADER,
	TARGET_QUERY: TARGET_QUERY,
	normalizeTarget: normalizeTarget,
	resolveTarget: resolveTarget,
	isProxyPath: isProxyPath,
	createMiddleware: createMiddleware,
	createServer: createServer,
	proxy: proxy,
};
