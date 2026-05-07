"""Sandbox passthrough proxy for the PDAX (Philippines) API. See README.md."""

import hmac
import logging
import os
from urllib.parse import urljoin

import requests
from flask import Flask, Response, request

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

UPSTREAM_BASE_URL = os.environ.get("UPSTREAM_BASE_URL", "https://api-sandbox.pdax.ph")
PROXY_SECRET = os.environ.get("PROXY_SECRET", "")
REQUEST_TIMEOUT = float(os.environ.get("REQUEST_TIMEOUT", "30"))

# RFC 7230 hop-by-hop headers, plus Host (which requests sets) and Content-Length
# (which requests recomputes from the body it actually sends).
HOP_BY_HOP = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
        "host",
        "content-length",
    }
)

# PDAX requires underscored auth header names (`access_token`, `id_token`),
# but WSGI collapses underscored and dashed header names into the same env
# var, so we can't preserve them through this proxy untouched. Callers send
# the dashed wrapper names and we re-emit the underscored form on egress.
WRAPPER_HEADERS = {
    "x-pdax-access-token": "access_token",
    "x-pdax-id-token": "id_token",
}


def _authorized() -> bool:
    if not PROXY_SECRET:
        return False
    provided = request.headers.get("X-Proxy-Secret", "")
    return hmac.compare_digest(provided, PROXY_SECRET)


@app.route("/healthz", methods=["GET"])
def healthz() -> Response:
    return Response("ok", status=200, mimetype="text/plain")


@app.route(
    "/",
    defaults={"path": ""},
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
@app.route(
    "/<path:path>",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
def proxy(path: str) -> Response:
    if not _authorized():
        return Response("forbidden", status=403, mimetype="text/plain")

    target_url = urljoin(UPSTREAM_BASE_URL.rstrip("/") + "/", path)

    forwarded_headers: dict[str, str] = {}
    for k, v in request.headers.items():
        lk = k.lower()
        if lk in HOP_BY_HOP or lk == "x-proxy-secret":
            continue
        if lk in WRAPPER_HEADERS:
            forwarded_headers[WRAPPER_HEADERS[lk]] = v
        else:
            forwarded_headers[k] = v

    # Buffers the entire request and response in memory. Fine for sandbox JSON;
    # would need streaming for large uploads/downloads.
    upstream = requests.request(
        method=request.method,
        url=target_url,
        params=request.args,
        headers=forwarded_headers,
        data=request.get_data(),
        allow_redirects=False,
        timeout=REQUEST_TIMEOUT,
    )

    app.logger.info("%s /%s -> %s", request.method, path, upstream.status_code)

    response_headers = [
        (k, v) for k, v in upstream.headers.items() if k.lower() not in HOP_BY_HOP
    ]

    return Response(
        upstream.content,
        status=upstream.status_code,
        headers=response_headers,
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5000")))
