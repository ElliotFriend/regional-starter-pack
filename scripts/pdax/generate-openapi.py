#!/usr/bin/env python3
"""
Convert PDAX Gatsby page-data.json into an OpenAPI 3.0.3 spec, plus a
TypeScript reference module for runtime use in the client.

The script lives in scripts/pdax/ and writes its outputs into the runtime
anchor directory at src/lib/anchors/pdax/. Paths are resolved relative to
this file's location, so it can be invoked from any CWD:

    python3 scripts/pdax/generate-openapi.py            # from repo root
    python3 generate-openapi.py                         # from scripts/pdax/

Override with --input / --output / --reference if needed.

Refreshing page-data.json from the docs site (`--fetch`):

    The PDAX docs at https://doc.general.api.pdax.ph are password-gated.
    To pull a fresh copy, log in via the browser, then copy the full
    `Cookie` header value from DevTools (Network tab → any request to
    the docs origin → Headers → Request Headers → Cookie). Pass it via
    the PDAX_DOCS_COOKIE env var:

        export PDAX_DOCS_COOKIE='session=...; remember_me=...'
        python3 scripts/pdax/generate-openapi.py --fetch

    The default fetch URL is the Gatsby page-data path; override with
    --fetch-url if the docs reorganize.

Optional: install scripts/pdax/requirements.txt for the --validate flag.
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

import yaml

SCRIPT_DIR = Path(__file__).resolve().parent
ANCHOR_DIR = SCRIPT_DIR.parent.parent / "src" / "lib" / "anchors" / "pdax"
DEFAULT_INPUT = SCRIPT_DIR / "page-data.json"
DEFAULT_OUTPUT = ANCHOR_DIR / "openapi.yaml"
DEFAULT_REFERENCE = ANCHOR_DIR / "reference.ts"
DEFAULT_FETCH_URL = "https://doc.general.api.pdax.ph/page-data/index/page-data.json"


def _yaml_str_representer(dumper, data):
    """Render multi-line strings as YAML literal block scalars (`|`).

    Without this, PyYAML uses single-quoted style for strings containing
    newlines, which folds them into paragraph breaks (rendered as blank
    lines between e.g. bullet-list items). Literal block keeps them clean.
    """
    if "\n" in data:
        return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="|")
    return dumper.represent_scalar("tag:yaml.org,2002:str", data)


yaml.add_representer(str, _yaml_str_representer)


# ---------------------------------------------------------------------------
# AST helpers
# ---------------------------------------------------------------------------

def extract_text(node):
    """Recursively extract plain text from an htmlAst node."""
    if node is None:
        return ""
    if node.get("type") == "text":
        return node.get("value", "")
    return "".join(extract_text(c) for c in node.get("children", []))


def parse_table(node):
    """Parse a <table> AST node into a list of dicts keyed by header row."""
    rows = []
    for child in node.get("children", []):
        tag = child.get("tagName", "")
        row_containers = (
            child.get("children", []) if tag in ("thead", "tbody") else [child]
        )
        for row in row_containers:
            if row.get("tagName") != "tr":
                continue
            cells = [
                extract_text(cell).strip()
                for cell in row.get("children", [])
                if cell.get("tagName") in ("th", "td")
            ]
            if cells:
                rows.append(cells)

    if len(rows) < 2:
        return rows  # not enough for header + data

    headers = [h.lower().replace(" ", "_") for h in rows[0]]

    # Some tables use a two-level header: a category row first, then the real
    # Parameter/Type/Description row.  Detect this and skip the first row.
    if (
        len(rows) > 2
        and "parameter" not in headers
        and "key" not in headers
        and "name" not in headers
    ):
        candidate = [h.lower().replace(" ", "_") for h in rows[1]]
        if "parameter" in candidate or "key" in candidate or "name" in candidate:
            headers = candidate
            rows = rows[1:]  # shift so rows[1:] becomes the data rows

    return [
        {headers[i]: (row[i] if i < len(row) else "") for i in range(len(headers))}
        for row in rows[1:]
        # Skip section-divider rows (single cell that's a group label like "Sender")
        if len(row) > 1
    ]


# ---------------------------------------------------------------------------
# Section parser - walks the AST and groups content by endpoint
# ---------------------------------------------------------------------------

def parse_sections(children):
    """Return a list of endpoint section dicts parsed from the AST children."""
    sections = []
    current_h1 = None
    current_h4 = None
    current_section = None

    for child in children:
        if child.get("type") != "element":
            continue

        tag = child.get("tagName", "")

        if tag == "h1":
            current_h1 = extract_text(child).strip()
            current_h4 = None
            current_section = None

        elif tag == "h2":
            text = extract_text(child).strip()
            current_h4 = None
            method_match = re.match(
                r"^(GET|POST|PUT|DELETE|PATCH|Get|Post|Put|Delete|Patch)\s+(.+)",
                text,
            )
            if method_match:
                current_section = {
                    "group": current_h1,
                    "title": text,
                    "method": method_match.group(1).upper(),
                    "summary": method_match.group(2),
                    "path": None,
                    "description": "",
                    "body_params": [],
                    "query_params": [],
                    "path_params": [],
                    "response_schemas": [],
                    "error_codes": [],
                    "curl_examples": [],
                    "response_examples": [],
                }
                sections.append(current_section)
            elif "webhook" in text.lower() or "event" in text.lower():
                # Webhook sections don't start with an HTTP method in the h2
                current_section = {
                    "group": current_h1,
                    "title": text,
                    "method": "POST",  # webhooks are POST registrations
                    "summary": text,
                    "path": None,
                    "description": "",
                    "body_params": [],
                    "query_params": [],
                    "path_params": [],
                    "response_schemas": [],
                    "error_codes": [],
                    "curl_examples": [],
                    "response_examples": [],
                }
                sections.append(current_section)
            else:
                current_section = None

        elif tag in ("h3", "h4"):
            current_h4 = extract_text(child).strip()

        elif tag == "table" and current_section:
            table_data = parse_table(child)
            if (
                isinstance(table_data, list)
                and table_data
                and isinstance(table_data[0], dict)
            ):
                h4 = (current_h4 or "").lower()
                # Check `error` before `response` because some H4s contain both
                # words (e.g. "Error Responses" on POST Fiat Out) and should
                # route to error_codes rather than getting captured as a
                # response payload schema.
                if "error" in h4:
                    # Some endpoints have multiple error tables under the same
                    # H4 (POST Fiat Out has both validation-style and
                    # runtime-style errors). Append rather than overwrite.
                    current_section["error_codes"].extend(table_data)
                elif "body" in h4:
                    current_section["body_params"] = table_data
                elif "query" in h4:
                    current_section["query_params"] = table_data
                elif "path" in h4:
                    current_section["path_params"] = table_data
                elif "response" in h4 or "payload" in h4:
                    current_section["response_schemas"].append(
                        {"title": current_h4, "fields": table_data}
                    )
                else:
                    current_section["response_schemas"].append(
                        {"title": current_h4 or "Unknown", "fields": table_data}
                    )

        elif tag == "pre" and current_section:
            code_text = ""
            for c in child.get("children", []):
                if c.get("tagName") == "code":
                    code_text = extract_text(c).strip()
                    break
            if not code_text:
                code_text = extract_text(child).strip()

            if code_text.startswith("curl ") or "curl " in code_text[:20]:
                current_section["curl_examples"].append(code_text)
            elif re.match(r"^(GET|POST|PUT|DELETE|PATCH)\s+/", code_text):
                parts = code_text.split()
                if len(parts) >= 2:
                    current_section["path"] = parts[1]
            elif code_text.startswith("{") or code_text.startswith("["):
                current_section["response_examples"].append(code_text)

        elif tag == "p" and current_section:
            text = extract_text(child).strip()
            # Check if this paragraph contains an HTTP request path
            # Path must start with / or a known prefix like pdax-institution
            path_match = re.match(
                r"^(GET|POST|PUT|DELETE|PATCH)\s+(/\S+|pdax-\S+)", text
            )
            if path_match and not current_section["path"]:
                current_section["path"] = path_match.group(2)
                current_section["method"] = path_match.group(1).upper()
            elif text and current_h4 is None and not current_section.get("description"):
                current_section["description"] = text

    # Back-fill paths from curl examples
    for s in sections:
        if not s["path"] and s["curl_examples"]:
            m = re.search(r"'https?://[^/]+(/[^'?\s]+)", s["curl_examples"][0])
            if m:
                s["path"] = m.group(1)
        if s["path"]:
            s["path"] = re.sub(r"^/+", "/", s["path"].replace("//", "/"))
            if not s["path"].startswith("/"):
                s["path"] = "/" + s["path"]

    # Normalise the order-status path (curl uses a literal ID)
    for s in sections:
        if "order" in (s["title"] or "").lower() and "status" in (s["title"] or "").lower():
            if s["path"] and re.search(r"/\d+$", s["path"]):
                s["path"] = re.sub(r"/\d+$", "/{order_id}", s["path"])
                if not s["path"].startswith("/pdax-institution"):
                    s["path"] = "/pdax-institution" + s["path"]

    return sections


# ---------------------------------------------------------------------------
# Reference-section parser (Accepted Values, Bank Codes, Error Codes)
# ---------------------------------------------------------------------------


def _flat_cells(table_node):
    """Yield every (text, tagName) cell from every row of a <table>."""
    for c in table_node.get("children", []):
        row_containers = c.get("children", []) if c.get("tagName") in ("thead", "tbody") else [c]
        for row in row_containers:
            if row.get("tagName") != "tr":
                continue
            for cell in row.get("children", []):
                if cell.get("tagName") in ("th", "td"):
                    yield extract_text(cell).strip()


def _table_rows(table_node):
    """Yield each <tr>'s cell-text list."""
    for c in table_node.get("children", []):
        row_containers = c.get("children", []) if c.get("tagName") in ("thead", "tbody") else [c]
        for row in row_containers:
            if row.get("tagName") != "tr":
                continue
            yield [
                extract_text(cell).strip()
                for cell in row.get("children", [])
                if cell.get("tagName") in ("th", "td")
            ]


def parse_reference_data(children):
    """Walk top-level AST and pull global reference sections.

    Returns a dict with keys:
        countries, sources_of_funds, fee_types, sex_values, purposes,
        relationships, fiat_in_methods, fiat_out_methods, tokens,
        bank_codes, error_codes, tag_error_codes

    `tag_error_codes` is a dict of `{tag_name: [{code, name, http_status, message}]}`
    capturing tag-wide error references like `[Trade] > Error Codes`. The docs
    list these with proper HTTP-Status info that the per-endpoint tables lack
    (the per-endpoint Trade tables are 2-col `Key | Type`-only); we use them to
    backfill statuses when bucketing per-endpoint OT codes.
    """
    refs = {
        "countries": [],
        "sources_of_funds": [],
        "fee_types": [],
        "sex_values": [],
        "purposes": [],
        "relationships": [],
        "fiat_in_methods": [],  # flat list of method names — used for the enum
        "fiat_in_methods_info": [],  # [{"method", "source_wallet", "mode"}] — richer metadata
        "fiat_out_methods": [],
        "tokens": [],  # [{"symbol": ..., "network": ...}] — may have same symbol on multiple networks
        "bank_codes": [],  # [{"entity_type": ..., "name": ..., "code": ...}]
        "error_codes": [],  # [{"code": ..., "name": ..., "http_status": ..., "message": ...}]
        "tag_error_codes": {},  # {tag_name: [{code, name, http_status, message}]}
    }

    h1 = h2 = h3 = None
    for child in children:
        if not isinstance(child, dict) or child.get("type") != "element":
            continue
        tag = child.get("tagName")
        if tag == "h1":
            h1 = extract_text(child).strip()
            h2 = h3 = None
            continue
        if tag == "h2":
            h2 = extract_text(child).strip()
            h3 = None
            continue
        if tag in ("h3", "h4"):
            h3 = extract_text(child).strip()
            continue
        if tag != "table":
            continue

        # Country List: multi-column display, just collect every non-blank cell
        if h1 == "Accepted Values" and h2 == "Country List":
            refs["countries"].extend(c for c in _flat_cells(child) if c)
            continue

        # Single-column accepted-values lists (skip the blank header row)
        single_col_targets = {
            "Source of Funds": "sources_of_funds",
            "Fee Type": "fee_types",
            "Sex": "sex_values",
            "Purpose": "purposes",
            "Relationship of Sender to Beneficiary": "relationships",
        }
        if h1 == "Accepted Values" and h2 in single_col_targets:
            for cells in _table_rows(child):
                if len(cells) == 1 and cells[0]:
                    refs[single_col_targets[h2]].append(cells[0])
            continue

        # Fiat In > Method (3-col: Method Name, Source Wallet, Mode)
        if h1 == "Accepted Values" and h2 == "Fiat In" and h3 == "Method":
            rows = list(_table_rows(child))
            if rows:
                for cells in rows[1:]:
                    if not cells or not cells[0]:
                        continue
                    refs["fiat_in_methods"].append(cells[0])
                    refs["fiat_in_methods_info"].append({
                        "method": cells[0],
                        "source_wallet": cells[1] if len(cells) > 1 else "",
                        "mode": cells[2] if len(cells) > 2 else "",
                    })
            continue

        # Fiat Out > Method (single-col)
        if h1 == "Accepted Values" and h2 == "Fiat Out" and h3 == "Method":
            for cells in _table_rows(child):
                if len(cells) == 1 and cells[0]:
                    refs["fiat_out_methods"].append(cells[0])
            continue

        # Crypto > Tokens (Token, Network)
        if h1 == "Accepted Values" and h2 == "Crypto" and h3 == "Tokens":
            rows = list(_table_rows(child))
            if rows:
                for cells in rows[1:]:
                    if len(cells) >= 2 and cells[0]:
                        refs["tokens"].append({"symbol": cells[0], "network": cells[1]})
            continue

        # Bank Codes (Entity Type, Name, Bank Code)
        if h1 == "Bank Codes":
            rows = list(_table_rows(child))
            if rows:
                for cells in rows[1:]:
                    if len(cells) >= 3 and cells[2]:
                        refs["bank_codes"].append(
                            {"entity_type": cells[0], "name": cells[1], "code": cells[2]}
                        )
            continue

        # Global Error Codes (Code, Code Text, HTTP Status, Message)
        if h1 == "Error Codes":
            rows = list(_table_rows(child))
            if rows:
                for cells in rows[1:]:
                    if len(cells) >= 4 and cells[0]:
                        try:
                            status = int(cells[2])
                        except (ValueError, IndexError):
                            status = None
                        refs["error_codes"].append(
                            {
                                "code": cells[0],
                                "name": cells[1],
                                "http_status": status,
                                "message": cells[3],
                            }
                        )
            continue

        # Tag-wide Error Codes (e.g. [Trade] > Error Codes) — same column shape
        # as the global table, but scoped to a single tag. Used to backfill
        # HTTP statuses on per-endpoint codes that lack them.
        if h2 == "Error Codes" and h1 not in (None, "Error Codes"):
            rows = list(_table_rows(child))
            if rows and len(rows[0]) >= 4:
                bucket = refs["tag_error_codes"].setdefault(h1, [])
                for cells in rows[1:]:
                    if len(cells) >= 4 and cells[0]:
                        try:
                            status = int(cells[2])
                        except (ValueError, IndexError):
                            status = None
                        bucket.append(
                            {
                                "code": cells[0],
                                "name": cells[1],
                                "http_status": status,
                                "message": cells[3],
                            }
                        )
            continue

    # Dedupe (preserve order). String-list refs are deduped by value.
    for k, v in list(refs.items()):
        if not isinstance(v, list) or not v or not isinstance(v[0], str):
            continue
        seen = set()
        deduped = []
        for item in v:
            if item not in seen:
                seen.add(item)
                deduped.append(item)
        refs[k] = deduped

    # Tokens are dicts; dedupe by symbol (the source has duplicates like
    # PYUSD / ETH / USDC each appearing twice).
    seen_symbols = set()
    deduped_tokens = []
    for t in refs["tokens"]:
        sym = t.get("symbol", "")
        if sym and sym not in seen_symbols:
            seen_symbols.add(sym)
            deduped_tokens.append(t)
    refs["tokens"] = deduped_tokens

    return refs


# ---------------------------------------------------------------------------
# OpenAPI generation helpers
# ---------------------------------------------------------------------------

TYPE_MAP = {
    "string": "string", "str": "string",
    "number": "number", "float": "number", "double": "number", "decimal": "number",
    "integer": "integer", "int": "integer",
    "boolean": "boolean", "bool": "boolean",
    "array": "array", "list": "array",
    "object": "object", "json": "object",
}


def map_type(raw):
    return TYPE_MAP.get(raw.lower().strip(), "string")


# Mapping of reference-data keys to component schema names.
SCHEMA_NAMES = {
    "countries": "Country",
    "tokens": "Token",
    "bank_codes": "BankCode",
    "fiat_in_methods": "FiatInMethod",
    "fiat_out_methods": "FiatOutMethod",
    "sources_of_funds": "SourceOfFunds",
    "purposes": "Purpose",
    "fee_types": "FeeType",
    "sex_values": "Sex",
    "relationships": "Relationship",
}

# Mapping of schema name (as resolved by `resolve_schema_ref`) to the
# TypeScript const exported by `reference.ts`. Used by the identity-fields
# emitter so each field can point at the value-set the form should pull from.
# `Token` is intentionally absent — identity fields never carry the crypto
# token enum (the relevant token list at runtime is the curated STELLAR_TOKENS).
SCHEMA_TO_TS_CONST = {
    "Country": "COUNTRIES",
    "BankCode": "BANK_CODES",
    "FiatInMethod": "FIAT_IN_METHODS",
    "FiatOutMethod": "FIAT_OUT_METHODS",
    "SourceOfFunds": "SOURCES_OF_FUNDS",
    "Purpose": "PURPOSES",
    "FeeType": "FEE_TYPES",
    "Sex": "SEX_VALUES",
    "Relationship": "RELATIONSHIPS",
}


def schema_ref(name):
    """Render a $ref to a components schema by name."""
    return f"#/components/schemas/{name}"


def resolve_schema_ref(field_name, path, refs, description=""):
    """Return a `#/components/schemas/...` $ref string for the field, or None.

    Heuristics:
      - Field name → schema, with `method` resolved differently for fiat-in vs fiat-out
        based on the endpoint path.
      - The Token enum is applied to `currency` / `quote_currency` on `/trade` and
        `/crypto` paths, but NOT to `base_currency` (PDAX's docs treat the base side
        of a trade as PHP — the description literally says "PHP asset" — so applying
        the crypto-token enum there would be wrong). Field-level description text
        containing "PHP" also disables the token enum, as a defensive secondary check.
    """
    if not refs:
        return None
    name = field_name.lower()
    p = (path or "").lower()
    desc = (description or "").lower()

    if name == "purpose" and refs["purposes"]:
        return schema_ref(SCHEMA_NAMES["purposes"])
    if name == "source_of_funds" and refs["sources_of_funds"]:
        return schema_ref(SCHEMA_NAMES["sources_of_funds"])
    if name == "fee_type" and refs["fee_types"]:
        return schema_ref(SCHEMA_NAMES["fee_types"])
    if name == "relationship_of_sender_to_beneficiary" and refs["relationships"]:
        return schema_ref(SCHEMA_NAMES["relationships"])
    if name.endswith("_sex") and refs["sex_values"]:
        return schema_ref(SCHEMA_NAMES["sex_values"])
    if ("country" in name or name.endswith("nationality")) and refs["countries"]:
        return schema_ref(SCHEMA_NAMES["countries"])
    if name.endswith("bank_code") and refs["bank_codes"]:
        return schema_ref(SCHEMA_NAMES["bank_codes"])

    # Context-dependent: method differs between fiat-in and fiat-out.
    if name == "method":
        if ("/fiat/deposit" in p or "fiat-in" in p) and refs["fiat_in_methods"]:
            return schema_ref(SCHEMA_NAMES["fiat_in_methods"])
        if ("/fiat/withdraw" in p or "fiat-out" in p) and refs["fiat_out_methods"]:
            return schema_ref(SCHEMA_NAMES["fiat_out_methods"])

    # Currency fields: apply the Token enum on /trade and /crypto paths, but
    # never to `base_currency` (which is PHP per the docs) and never when the
    # field description suggests it's the fiat side of the pair.
    if name in ("currency", "quote_currency"):
        if "/trade" in p or "/crypto" in p:
            if name.startswith("base_") or "php" in desc:
                return None
            if refs["tokens"]:
                return schema_ref(SCHEMA_NAMES["tokens"])

    return None


def _render_metadata_table(headers, rows):
    """Render a markdown table from a list of header strings and a list of
    row tuples. Used to surface per-enum-value metadata (bank names, network,
    etc.) inside a schema's description without breaking the flat enum shape.
    """
    if not rows:
        return ""
    lines = ["| " + " | ".join(headers) + " |"]
    lines.append("| " + " | ".join("---" for _ in headers) + " |")
    for row in rows:
        lines.append("| " + " | ".join(str(c) for c in row) + " |")
    return "\n".join(lines)


def build_components_schemas(refs):
    """Promote the reference-data lists into reusable `components.schemas`.

    Each schema is a string enum (`type: string` + `enum: [...]`) so OpenAPI
    consumers can reference it via `$ref` from any number of fields. Schemas
    that have richer per-value metadata in the docs (Token network, Bank Code
    name + entity type, Fiat In source wallet + mode) carry that metadata in
    a markdown table inside the schema description.
    """
    schemas = {
        "SuccessEnvelope": {
            "type": "object",
            "description": (
                "Standard PDAX success response envelope. Every successful response "
                "wraps its payload in this shape. Endpoints override the `data` field's "
                "type via `allOf` — single-object endpoints set it to a typed object, "
                "list endpoints set it to a typed array."
            ),
            "properties": {
                "status": {"type": "string", "example": "success"},
                "data": {
                    "description": (
                        "Endpoint-specific payload. See the per-endpoint response "
                        "schema for the actual shape (object or array)."
                    ),
                },
            },
            "required": ["data", "status"],
        },
        "ErrorEnvelope": {
            "type": "object",
            "description": (
                "Standard PDAX error response envelope. Specific endpoints "
                "constrain the `code` field to a known enum via `allOf` in their "
                "response components."
            ),
            "properties": {
                "status": {"type": "string", "example": "error"},
                "code": {
                    "type": "string",
                    "description": "PDAX-assigned machine-readable error code.",
                },
                "message": {
                    "type": "string",
                    "description": "Human-readable error message.",
                },
            },
            "required": ["code", "message"],
        },
    }

    if refs["countries"]:
        schemas["Country"] = {
            "type": "string",
            "description": (
                "Country accepted by PDAX, sourced from the docs' Accepted Country List."
            ),
            "enum": list(refs["countries"]),
        }
    if refs["tokens"]:
        # The source has same-symbol-different-network rows (PYUSD on Ethereum
        # and Solana, ETH on Ethereum and Base, USDC on Ethereum and Base).
        # The enum has to be unique, so we keep the first occurrence per symbol;
        # the markdown table shows ALL network variants so the metadata isn't lost.
        seen = set()
        unique_symbols = []
        for t in refs["tokens"]:
            if t["symbol"] not in seen:
                seen.add(t["symbol"])
                unique_symbols.append(t["symbol"])
        token_table = _render_metadata_table(
            ["Token", "Network"], [(t["symbol"], t["network"]) for t in refs["tokens"]],
        )
        schemas["Token"] = {
            "type": "string",
            "description": (
                "Crypto asset symbol. Includes per-network variants "
                "(e.g. `USDCXLM` = USDC on Stellar, `USDCSOL` = USDC on Solana). "
                "A few symbols (`ETH`, `USDC`, `PYUSD`) appear under multiple networks "
                "in the source docs; the enum lists each symbol once but the table "
                "below preserves the full network mapping.\n\n" + token_table
            ),
            "enum": unique_symbols,
        }
    if refs["bank_codes"]:
        bank_table = _render_metadata_table(
            ["Code", "Name", "Entity Type"],
            [(b["code"], b["name"], b["entity_type"]) for b in refs["bank_codes"]],
        )
        schemas["BankCode"] = {
            "type": "string",
            "description": (
                "PDAX bank code (used for `beneficiary_bank_code` on /fiat/withdraw). "
                "Covers Philippine banks and e-wallet rails. Entity Type distinguishes "
                "traditional banks from e-wallets (GCash, Maya, etc.).\n\n" + bank_table
            ),
            "enum": [b["code"] for b in refs["bank_codes"]],
        }
    if refs["fiat_in_methods"]:
        method_table = _render_metadata_table(
            ["Method", "Source Wallet", "Mode"],
            [(m["method"], m["source_wallet"], m["mode"]) for m in refs["fiat_in_methods_info"]],
        ) if refs.get("fiat_in_methods_info") else ""
        description = (
            "Cash-in method for /fiat/deposit (selects the user-facing payment rail). "
            "`Source Wallet` describes who the user pays from; `Mode` is the rail "
            "behavior (debit pull vs QR scan)."
        )
        if method_table:
            description += "\n\n" + method_table
        schemas["FiatInMethod"] = {
            "type": "string",
            "description": description,
            "enum": list(refs["fiat_in_methods"]),
        }
    if refs["fiat_out_methods"]:
        schemas["FiatOutMethod"] = {
            "type": "string",
            "description": "Cash-out method for /fiat/withdraw (real-time vs batch bank rail).",
            "enum": list(refs["fiat_out_methods"]),
        }
    if refs["sources_of_funds"]:
        schemas["SourceOfFunds"] = {
            "type": "string",
            "enum": list(refs["sources_of_funds"]),
        }
    if refs["purposes"]:
        schemas["Purpose"] = {
            "type": "string",
            "description": "Purpose of the transaction (per-txn KYC requirement).",
            "enum": list(refs["purposes"]),
        }
    if refs["fee_types"]:
        schemas["FeeType"] = {
            "type": "string",
            "description": "Whether the sender or beneficiary bears the fiat-out fee.",
            "enum": list(refs["fee_types"]),
        }
    if refs["sex_values"]:
        schemas["Sex"] = {
            "type": "string",
            "enum": list(refs["sex_values"]),
        }
    if refs["relationships"]:
        schemas["Relationship"] = {
            "type": "string",
            "description": "Relationship of sender to beneficiary.",
            "enum": list(refs["relationships"]),
        }

    return schemas


def field_name_of(p):
    """Extract the canonical field name from a parsed table row."""
    return (p.get("parameter") or p.get("key") or p.get("name") or "").strip()


_ACCEPTED_VALUES_REF_RE = re.compile(
    r"\s*See\s+[^.]+?Accept(?:ed)?\s+Values?(?:\s*section)?\.?\s*$",
    flags=re.IGNORECASE,
)


def clean_description(desc):
    """Strip stale `See X under Accepted Values section` references from a
    description. The script promotes those values to `components.schemas`,
    so the pointer is no longer useful — and a few of them got concatenated
    onto adjacent text without a space (e.g.
    `"Source of fundsSee Source of Funds under Accepted Values section"`).

    Returns the cleaned string, or `None` if nothing useful is left.
    """
    if not desc:
        return desc
    cleaned = _ACCEPTED_VALUES_REF_RE.sub("", desc).strip()
    return cleaned or None


def is_required(p):
    """Whether a parsed table row is marked as required.

    The docs use two conventions interchangeably across tables: a "Required or
    Optional" column with values "Required"/"Optional", or a "Required" column
    with values "yes"/"no". We accept both.
    """
    val = (p.get("required", "") or p.get("required_or_optional", "")).lower().strip()
    if val.startswith("required"):
        return True
    if val in ("yes", "y", "true", "✓", "x"):
        return True
    return False


def schema_for_field(name, raw_type, path, refs, description=None):
    """Build the schema portion of a parameter or property — `$ref`, an inline
    narrowing (e.g. `base_currency` → PHP), or a plain `type:` placeholder."""
    n = name.lower()
    p = (path or "").lower()

    ref = resolve_schema_ref(name, path, refs, description)
    if ref:
        return {"$ref": ref}

    # Inline narrowings that don't warrant a full components schema.
    if n == "base_currency" and "/trade" in p:
        # PDAX's /trade endpoints document `base_currency` as the PHP side of
        # the pair; narrow to a one-value enum so consumers get the right type.
        return {"type": "string", "enum": ["PHP"]}

    return {"type": map_type(raw_type)}


def build_property(name, raw_type, description, path, refs):
    """Build a JSON-Schema property dict, resolving `$ref` to components when applicable."""
    description = clean_description(description)
    schema = schema_for_field(name, raw_type, path, refs, description)
    if description:
        # OpenAPI 3.1+ allows sibling keywords on `$ref`; keep the field-level
        # description when it adds context the schema-level description doesn't.
        schema = {**schema, "description": description}
    return schema


def params_to_schema(params, path=None, refs=None):
    properties = {}
    required = []
    for p in params:
        name = field_name_of(p)
        if not name:
            continue
        properties[name] = build_property(
            name, p.get("type", "string"), p.get("description", ""), path, refs
        )
        if is_required(p):
            required.append(name)
    schema = {"type": "object", "properties": properties}
    if required:
        schema["required"] = required
    return schema


def _infer_json_type(value):
    """Map a Python value (parsed from a JSON example) to a JSON-Schema type."""
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    return "string"  # treat null/unknown as string for the schema


def _schema_from_example(value):
    """Build a JSON-Schema fragment from an example value, recursively.

    Used when the docs' field-table type contradicts what the example actually
    contains (e.g. POST Fiat Out lists `retry_methods` as `String` in the docs
    but the example shows an array of objects). The example wins because it's
    the literal wire shape.
    """
    if isinstance(value, list):
        if not value:
            return {"type": "array", "items": {}}
        return {"type": "array", "items": _schema_from_example(value[0])}
    if isinstance(value, dict):
        return {
            "type": "object",
            "properties": {k: _schema_from_example(v) for k, v in value.items()},
        }
    return {"type": _infer_json_type(value)}


def response_to_schema(fields, example_inner=None):
    """Build a JSON-Schema object from a docs table of response fields.

    `example_inner` is the unwrapped/unenveloped example (single object — for
    arrays it's the first element). When provided, fields whose docs-declared
    type contradicts the example's actual type get overridden — primitive in
    the docs but array/object in the wire is the case we care about.
    """
    properties = {}
    for f in fields:
        name = field_name_of(f)
        if not name:
            continue
        declared = map_type(f.get("type", "string"))
        desc = clean_description(f.get("description", ""))

        # Example-driven override: when the docs say a primitive but the wire
        # actually carries an array/object, trust the example.
        if isinstance(example_inner, dict) and name in example_inner:
            actual = example_inner[name]
            actual_type = _infer_json_type(actual)
            if declared in ("string", "number", "integer", "boolean") and actual_type in (
                "array",
                "object",
            ):
                prop = _schema_from_example(actual)
                if desc:
                    prop["description"] = desc
                properties[name] = prop
                continue

        prop = {"type": declared}
        if desc:
            prop["description"] = desc
        properties[name] = prop
    return {"type": "object", "properties": properties}


HTTP_STATUS_TEXT = {
    400: "Bad request",
    401: "Unauthorized — invalid or expired token",
    403: "Forbidden",
    404: "Not found",
    500: "Internal server error",
    503: "Service unavailable",
}


def _looks_like_code(s):
    """Whether a string looks like an error code (e.g. PAP0400, OT010001)
    rather than a free-text validation message."""
    return bool(re.match(r"^[A-Z][A-Z0-9_]+$", s.strip()))


_TRAILING_COMMA_RE = re.compile(r",(\s*[}\]])")
_MISSING_COMMA_RE = re.compile(r"([}\]])(\s*[\[{])")


def parse_lenient_json(raw):
    """Parse a JSON string with light tolerance for the JS-style quirks
    sometimes present in PDAX's docs examples:
      - trailing commas before `}` / `]`
      - missing commas between adjacent objects/arrays (`}\\n{`, `]\\n[`)

    Returns the parsed object on success, `None` on failure — we treat
    unparseable examples as missing rather than crashing.
    """
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    cleaned = _TRAILING_COMMA_RE.sub(r"\1", raw)
    cleaned = _MISSING_COMMA_RE.sub(r"\1,\2", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


_RAW_ENVELOPE_RE = re.compile(r'^\s*\{\s*"data"\s*:\s*([\[\{])')


def detect_envelope_from_raw(raw):
    """Best-effort envelope detection when the example JSON can't be parsed
    (some PDAX docs examples have structural quirks beyond what
    `parse_lenient_json` repairs — e.g. an extra closing brace).

    Returns `(is_envelope, is_array)`, mirroring `detect_pdax_envelope`.
    """
    if not raw:
        return False, False
    m = _RAW_ENVELOPE_RE.match(raw)
    if not m:
        return False, False
    return True, m.group(1) == "["


def detect_pdax_envelope(example):
    """Inspect a parsed JSON example to decide how to shape its response schema.

    PDAX wraps every successful response in `{data, status}`. The `data` field
    is sometimes a single object (quote, order creation, fetch-by-id) and
    sometimes an array (transaction listings, balances). We can't know which
    shape an endpoint uses purely from the docs' field tables — those describe
    the inner payload only — so we detect it from the example shape.

    Returns `(is_envelope: bool, is_array: bool)`:
      - `is_envelope=True`  → wrap the inner schema in `allOf` with `SuccessEnvelope`
      - `is_envelope=False` → leave the schema as-is (no example, or example
        doesn't match the envelope; we'd rather emit a slightly-wrong schema
        than incorrectly assert a wire shape we haven't seen)
      - `is_array=True`     → set `data: {type: array, items: <inner>}` inside the override
    """
    if not isinstance(example, dict):
        return False, False
    if "data" not in example:
        return False, False
    if not set(example.keys()).issubset({"data", "status"}):
        return False, False
    return True, isinstance(example["data"], list)


def envelope_wrap_schema(inner_schema, is_array):
    """Wrap an inner response schema in PDAX's `{data, status}` envelope.

    Uses `allOf` against the shared `SuccessEnvelope` schema and overrides the
    generic `data` field with the endpoint-specific shape.
    """
    data_schema = {"type": "array", "items": inner_schema} if is_array else inner_schema
    return {
        "allOf": [
            {"$ref": schema_ref("SuccessEnvelope")},
            {
                "type": "object",
                "properties": {"data": data_schema},
            },
        ]
    }


def categorize_error_codes(rows, status_lookup=None):
    """Bucket per-endpoint error codes by HTTP status.

    Handles all three table formats observed in the docs:
      - {Code, Name, HTTP Status, Message}
      - {Key, Type}                              # status defaults to 400
      - {Response, HTTP Status Code, Description} # validation-style errors

    `status_lookup` is an optional `{code: http_status}` mapping (built from
    a tag-wide `[Tag] > Error Codes` table) used to backfill statuses on
    rows that lack them — without it, every code from a 2-col `Key | Type`
    table would default to 400 even though some are 500-class.

    Returns: dict[status_code (int), list[{code, name, message}]].
    """
    by_status = {}
    for r in rows:
        code = (
            r.get("code") or r.get("key") or r.get("response") or r.get("name") or ""
        ).strip()
        msg = (r.get("message") or r.get("description") or r.get("type") or "").strip()
        name = r.get("name", "").strip() if r.get("name") and r.get("name") != code else ""
        if not code and not msg:
            continue

        try:
            status = int(r.get("http_status") or r.get("http_status_code") or 0)
        except (TypeError, ValueError):
            status = 0
        if status < 400:
            # Try the tag-wide lookup before falling back to 400
            if status_lookup and code in status_lookup:
                status = status_lookup[code]
            else:
                status = 400

        by_status.setdefault(status, []).append({
            "code": code,
            "name": name,
            "message": msg,
        })
    return by_status


def _all_global_pap_codes(codes):
    """True if every code in the list is a PAP-prefixed global code (i.e.
    nothing endpoint-specific is being added)."""
    return bool(codes) and all(c["code"].startswith("PAP") for c in codes)


def _operation_pascal(operation_id):
    """Convert snake_case operationId to PascalCase for component naming."""
    return "".join(p.capitalize() for p in operation_id.split("_") if p)


def _render_error_description(status, codes):
    """Build the description string for an error response component."""
    base = HTTP_STATUS_TEXT.get(status, f"HTTP {status} error")
    if not codes:
        return base
    lines = [base + ". Possible codes:"]
    for c in codes:
        line = f"- `{c['code']}`"
        if c.get("name"):
            line += f" ({c['name']})"
        if c.get("message"):
            line += f": {c['message']}"
        lines.append(line)
    return "\n".join(lines)


def _error_response_schema(codes):
    """Schema for an error response: ErrorEnvelope + an enum on `code`."""
    if not codes:
        return {"$ref": schema_ref("ErrorEnvelope")}
    return {
        "allOf": [
            {"$ref": schema_ref("ErrorEnvelope")},
            {
                "type": "object",
                "properties": {
                    "code": {
                        "type": "string",
                        "enum": [c["code"] for c in codes],
                    }
                },
            },
        ]
    }


def _error_response_component(status, codes):
    """Wrap the schema in a full response component (description + content)."""
    return {
        "description": _render_error_description(status, codes),
        "content": {"application/json": {"schema": _error_response_schema(codes)}},
    }


def build_components_responses(refs, sections):
    """Build the components.responses dict.

    Includes:
      - `ErrorEnvelope`-shaped global responses (`PdaxError400`, `PdaxError401`,
        `PdaxError500`, `PdaxError503`) sourced from the docs' global Error Codes table.
      - Per-endpoint custom response components (e.g. `PostOrderError400`) for
        endpoints whose docs declare non-global error codes (notably the Trade
        endpoints' OT010xxx series).
    """
    responses = {}

    # Global responses, grouped by status from the global Error Codes table.
    by_status = {}
    for e in refs["error_codes"]:
        status = e.get("http_status") or 400
        by_status.setdefault(status, []).append({
            "code": e["code"],
            "name": e.get("name", ""),
            "message": e.get("message", ""),
        })
    for status, codes in sorted(by_status.items()):
        responses[f"PdaxError{status}"] = _error_response_component(status, codes)

    # Always provide PdaxError401 even if not in the global table — every authed
    # endpoint can return one.
    if "PdaxError401" not in responses:
        responses["PdaxError401"] = _error_response_component(
            401,
            [{"code": "PAP0401", "name": "Unauthorize", "message": "Unauthorized"}],
        )

    # Per-endpoint custom responses. We emit a component only when the endpoint
    # introduces codes beyond the global PAP set (e.g. Trade endpoints have OT*).
    for s in sections:
        if not s.get("error_codes"):
            continue
        operation_id = re.sub(r"[^a-zA-Z0-9]", "_", s["title"]).strip("_").lower()
        status_lookup = _tag_error_status_lookup(refs, s.get("group"))
        per_endpoint = categorize_error_codes(s["error_codes"], status_lookup)
        for status, codes in per_endpoint.items():
            if _all_global_pap_codes(codes):
                continue  # nothing custom — fall through to the global component
            comp_name = f"{_operation_pascal(operation_id)}Error{status}"
            responses[comp_name] = _error_response_component(status, codes)

    return responses


def _tag_error_status_lookup(refs, tag):
    """Build a `{code: http_status}` map from `refs.tag_error_codes[tag]`."""
    if not refs or not tag:
        return None
    bucket = refs.get("tag_error_codes", {}).get(tag)
    if not bucket:
        return None
    return {e["code"]: e["http_status"] for e in bucket if e.get("http_status")}


def endpoint_responses_for(operation_id, section, success_responses, refs):
    """Build the `responses` dict on an operation, weaving in error $refs.

    Strategy:
      - Success responses (from the docs' "Schema of Response Payload" tables)
        keep their existing inline schema.
      - 401 always references `PdaxError401` (except for endpoints in the
        Authentication tag, where 401 is the success-of-failure case the route
        documents itself).
      - Other error statuses (400/500/503) reference `PdaxError{status}` by
        default, but a per-endpoint custom component takes precedence when one
        was emitted for the same status.
    """
    is_authenticated = section.get("group") != "Authentication"
    responses = dict(success_responses)

    custom_overrides = {}
    if section.get("error_codes"):
        status_lookup = _tag_error_status_lookup(refs, section.get("group"))
        per_endpoint = categorize_error_codes(section["error_codes"], status_lookup)
        for status, codes in per_endpoint.items():
            if _all_global_pap_codes(codes):
                continue
            custom_overrides[status] = (
                f"{_operation_pascal(operation_id)}Error{status}"
            )

    # Status buckets we apply globally.
    candidate_statuses = sorted(
        {400, 401, 500, 503}
        | {s for s in custom_overrides}
        | {e.get("http_status") for e in refs["error_codes"] if e.get("http_status")}
    )

    for status in candidate_statuses:
        if status == 401 and not is_authenticated:
            continue
        comp_name = custom_overrides.get(status, f"PdaxError{status}")
        responses[str(status)] = {"$ref": f"#/components/responses/{comp_name}"}

    return responses


# ---------------------------------------------------------------------------
# Build the spec
# ---------------------------------------------------------------------------

def build_spec(sections, refs=None):
    # Top-level key order follows the OpenAPI convention used by Redocly,
    # Swagger UI, and most published specs: openapi → info → servers →
    # security → tags → paths → webhooks → components. `components` lives
    # at the bottom because it's the reference target for everything above
    # it; readers scanning the file scan top-down through endpoints first.
    spec = {
        "openapi": "3.2.0",
        "info": {
            "title": "PDAX Institutions API",
            "description": (
                "PDAX API for Institutions - fiat/crypto conversion, deposits, "
                "withdrawals, and balance management."
            ),
            "version": "1.0.0",
            "license": {"name": "Proprietary"},
        },
        "servers": [
            {
                "url": "https://services.pdax.ph/api/pdax-api",
                "description": "Production",
            },
            {
                "url": "https://stage.services.sandbox.pdax.ph/api/pdax-api",
                "description": "Stage / Sandbox",
            },
        ],
        "security": [{"bearerAuth": [], "idToken": []}],
        "tags": sorted(
            [{"name": g} for g in {s["group"] for s in sections if s["group"]}],
            key=lambda t: t["name"],
        ),
        "paths": {},
    }

    for s in sections:
        path = s["path"]
        if not path:
            continue
        # The two `Webhook Events for X Transactions` sections are not separate
        # endpoints at PDAX — they document the payload PDAX delivers to OUR
        # registered URL. They're handled out-of-band below: their event-data
        # schemas land in `components.schemas` and their PathItem entries in
        # the top-level `webhooks:` block. Skip them here so we don't emit
        # them as colliding `paths:` entries.
        if _is_webhook_section(s):
            continue

        method = s["method"].lower()

        operation = {
            "summary": s["title"],
            "tags": [s["group"]] if s["group"] else [],
            "operationId": re.sub(r"[^a-zA-Z0-9]", "_", s["title"]).strip("_").lower(),
        }

        if s["description"]:
            operation["description"] = s["description"]

        # Auth endpoints don't require tokens
        if s["group"] == "Authentication":
            operation["security"] = []
        else:
            operation["security"] = [{"bearerAuth": [], "idToken": []}]

        # Query + path parameters
        parameters = []
        for p in s["query_params"]:
            name = field_name_of(p)
            if not name:
                continue
            description = clean_description(p.get("description", ""))
            schema = schema_for_field(name, p.get("type", "string"), path, refs, description)
            param = {"name": name, "in": "query", "schema": schema}
            if description:
                param["description"] = description
            if is_required(p):
                param["required"] = True
            parameters.append(param)

        for p in s["path_params"]:
            name = field_name_of(p)
            if not name:
                continue
            param = {
                "name": name,
                "in": "path",
                "required": True,
                "schema": {"type": map_type(p.get("type", "string"))},
            }
            if p.get("description"):
                param["description"] = p["description"]
            parameters.append(param)

        if parameters:
            operation["parameters"] = parameters

        # Request body
        if s["body_params"]:
            operation["requestBody"] = {
                "required": True,
                "content": {
                    "application/json": {
                        "schema": params_to_schema(s["body_params"], path=path, refs=refs)
                    }
                },
            }

        # Success-side responses (from the docs' "Schema of Response Payload"
        # tables). Error-shaped tables are skipped — they're now handled by the
        # components.responses layer.
        success_variants = [
            rs for rs in s["response_schemas"] if "error" not in (rs["title"] or "").lower()
        ]

        # Inspect the first example to decide whether this endpoint's response
        # is wrapped in PDAX's `{data, status}` envelope, and whether `data` is
        # an array vs a single object. The schemas we build from the field
        # tables describe just the inner payload, so without this detection
        # the spec would either lie about the wire shape (option A — strip
        # the envelope) or model lists as objects (option B but no detection).
        example_obj = None
        is_envelope = False
        is_array = False
        if s["response_examples"]:
            raw_example = s["response_examples"][0]
            example_obj = parse_lenient_json(raw_example)
            if example_obj is not None:
                is_envelope, is_array = detect_pdax_envelope(example_obj)
            else:
                # Couldn't parse the example, but we can still detect the
                # envelope shape from the raw JSON prefix. Better to wrap
                # the schema correctly than to fall back to an inaccurate
                # unwrapped one just because the docs' example is malformed.
                is_envelope, is_array = detect_envelope_from_raw(raw_example)

        # Pull the inner data out of the parsed example (for type inference
        # against the field tables). Arrays use the first element as the
        # representative shape.
        example_inner = None
        if isinstance(example_obj, dict):
            example_inner = example_obj.get("data") if is_envelope else example_obj
            if is_array and isinstance(example_inner, list):
                example_inner = example_inner[0] if example_inner else None

        def shape_variant(rs):
            inner = response_to_schema(rs["fields"], example_inner)
            schema = envelope_wrap_schema(inner, is_array) if is_envelope else inner
            return {**schema, "title": rs["title"]} if rs.get("title") else schema

        success_responses = {}
        if len(success_variants) > 1:
            # Multiple non-error response shapes — model as `oneOf` under a
            # single 200 (e.g. POST /login returns either an MFA challenge or
            # an issued token pair, both with HTTP 200). Each variant is
            # individually envelope-wrapped when the example signals it.
            success_responses["200"] = {
                "description": "Successful response (multiple variants)",
                "content": {
                    "application/json": {
                        "schema": {"oneOf": [shape_variant(rs) for rs in success_variants]}
                    }
                },
            }
        elif success_variants:
            rs = success_variants[0]
            inner = response_to_schema(rs["fields"], example_inner)
            schema = envelope_wrap_schema(inner, is_array) if is_envelope else inner
            success_responses["200"] = {
                "description": rs["title"] or "Successful response",
                "content": {"application/json": {"schema": schema}},
            }

        # Attach the parsed example (envelope-wrapped or not — kept verbatim
        # to match the wire format the schema now describes).
        if example_obj is not None and "200" in success_responses:
            success_responses["200"]["content"]["application/json"]["example"] = example_obj

        if not success_responses:
            success_responses["200"] = {"description": "Successful response"}

        operation["responses"] = endpoint_responses_for(
            operation["operationId"], s, success_responses, refs
        )

        spec["paths"].setdefault(path, {})[method] = operation

    # Inject the unified webhook-registration endpoint (one op for both event
    # types, with `event_type` enumerated). Replaces the two colliding ops the
    # docs split into separate H2 sections.
    registration_op = build_webhook_registration_operation(sections)
    if registration_op:
        spec["paths"]["/pdax-institution/v1/config/webhook"] = {"post": registration_op}

    # Top-level `webhooks:` (OpenAPI 3.1+) for the incoming event payloads.
    webhooks = build_webhooks_block(sections)
    if webhooks:
        spec["webhooks"] = webhooks

    # Mark v1 paths as deprecated when a v2 sibling exists at the same path.
    for v1_path in [p for p in spec["paths"] if "/v1/" in p]:
        v2_path = v1_path.replace("/v1/", "/v2/")
        if v2_path in spec["paths"]:
            for op in spec["paths"][v1_path].values():
                op["deprecated"] = True

    # Components live at the bottom — `paths`/`webhooks` reference them.
    spec["components"] = {
        "securitySchemes": {
            "bearerAuth": {
                "type": "apiKey",
                "in": "header",
                "name": "access_token",
                "description": "JWT access token from the login endpoint",
            },
            "idToken": {
                "type": "apiKey",
                "in": "header",
                "name": "id_token",
                "description": "JWT identity token from the login endpoint",
            },
        },
        "schemas": {
            **(build_components_schemas(refs) if refs else {}),
            **webhook_event_schemas(sections),
        },
        "responses": build_components_responses(refs, sections) if refs else {},
    }

    return spec


# ---------------------------------------------------------------------------
# TypeScript reference module
# ---------------------------------------------------------------------------


def _ts_string_array(values):
    """Render a list of strings as a TypeScript array literal."""
    parts = ",\n".join(f"    {json.dumps(v)}" for v in values)
    return f"[\n{parts},\n]"


def _ts_object_array(items, keys):
    """Render a list of dicts as a TS array of object literals (keys in order)."""
    lines = []
    for it in items:
        body = ", ".join(f"{k}: {json.dumps(it.get(k, ''))}" for k in keys)
        lines.append(f"    {{ {body} }}")
    return "[\n" + ",\n".join(lines) + ",\n]"


TS_HEADER = (
    "// Generated from PDAX page-data.json by generate-openapi.py — do not edit directly.\n"
    "// Regenerate with: python3 src/lib/anchors/pdax/generate-openapi.py\n"
)


def _ts_const_union(const_name, type_name, values, comment=None):
    """Return a TS string-literal-union export block."""
    block = ""
    if comment:
        block += f"// {comment}\n"
    block += f"export const {const_name} = {_ts_string_array(values)} as const;\n"
    block += f"export type {type_name} = (typeof {const_name})[number];\n"
    return block


# (TS const name, TS type name, refs key) for each simple string-literal union.
_TS_UNIONS = [
    ("SOURCES_OF_FUNDS", "SourceOfFunds", "sources_of_funds"),
    ("FEE_TYPES", "FeeType", "fee_types"),
    ("SEX_VALUES", "Sex", "sex_values"),
    ("PURPOSES", "Purpose", "purposes"),
    ("RELATIONSHIPS", "RelationshipOfSenderToBeneficiary", "relationships"),
    ("FIAT_IN_METHODS", "FiatInMethod", "fiat_in_methods"),
    ("FIAT_OUT_METHODS", "FiatOutMethod", "fiat_out_methods"),
    ("COUNTRIES", "Country", "countries"),
]


def _emit_simple_unions(refs):
    """Emit string-literal-union exports for the simple accepted-values lists."""
    return [
        _ts_const_union(const, ts_type, refs[key])
        for const, ts_type, key in _TS_UNIONS
        if refs[key]
    ]


def _emit_stellar_tokens(refs):
    """Emit the STELLAR_TOKENS export, filtered to Stellar-network tokens.

    PDAX supports many tokens on other networks (Ethereum, Solana, Polygon, …);
    those are captured in the OpenAPI spec's `Token` enum but omitted here
    because the runtime client only cares about Stellar-network assets.
    """
    stellar_tokens = [t for t in refs["tokens"] if t["network"].lower() == "stellar"]
    if not stellar_tokens:
        return None
    other_count = len(refs["tokens"]) - len(stellar_tokens)
    comment = (
        "Crypto tokens supported by PDAX, filtered to Stellar network only.\n"
        f"// PDAX supports {other_count} additional tokens on other networks "
        "(Ethereum, Solana, Polygon, etc.) — see openapi.yaml for the full list."
    )
    return (
        f"// {comment}\n"
        "export interface CryptoToken {\n"
        "    symbol: string;\n"
        "    network: string;\n"
        "}\n"
        "export const STELLAR_TOKENS: readonly CryptoToken[] = "
        f"{_ts_object_array(stellar_tokens, ['symbol', 'network'])};\n"
    )


def _emit_fiat_in_methods_info(refs):
    """Emit the FIAT_IN_METHODS_INFO array, mirroring the FIAT_IN_METHODS
    string union with the source-wallet and mode metadata attached."""
    info = refs.get("fiat_in_methods_info") or []
    if not info:
        return None
    items = [
        {"method": i["method"], "sourceWallet": i["source_wallet"], "mode": i["mode"]}
        for i in info
    ]
    return (
        "// Cash-in methods with their source wallet and rail mode. Mirrors\n"
        "// FIAT_IN_METHODS but carries the metadata that the string union\n"
        "// above can't express on its own.\n"
        "export interface FiatInMethodInfo {\n"
        "    method: FiatInMethod;\n"
        "    sourceWallet: string;\n"
        "    mode: string;\n"
        "}\n"
        "export const FIAT_IN_METHODS_INFO: readonly FiatInMethodInfo[] = "
        f"{_ts_object_array(items, ['method', 'sourceWallet', 'mode'])};\n"
    )


def _emit_bank_codes(refs):
    """Emit the BANK_CODES lookup."""
    if not refs["bank_codes"]:
        return None
    items = [
        {"code": b["code"], "name": b["name"], "entityType": b["entity_type"]}
        for b in refs["bank_codes"]
    ]
    return (
        "// Bank codes used by /fiat/withdraw `beneficiary_bank_code`.\n"
        "// Includes traditional banks and e-wallet rails.\n"
        "export interface BankInfo {\n"
        "    code: string;\n"
        "    name: string;\n"
        "    entityType: string;\n"
        "}\n"
        "export const BANK_CODES: readonly BankInfo[] = "
        f"{_ts_object_array(items, ['code', 'name', 'entityType'])};\n"
    )


def _identity_field_kind(field_name, path, refs, description):
    """Return `(kind, enum_const)` for an identity field.

    `kind` is `'enum'` if the field maps to a known accepted-values list,
    `'date'` for `*_dob` fields (PDAX docs document these as mm-dd-yyyy
    strings), or `'string'` otherwise. `enum_const` is the TypeScript
    const name from this module (`COUNTRIES`, `SOURCES_OF_FUNDS`, etc.) or
    `None` for non-enum fields.
    """
    ref = resolve_schema_ref(field_name, path, refs, description)
    if ref:
        schema_name = ref.rsplit("/", 1)[-1]
        const = SCHEMA_TO_TS_CONST.get(schema_name)
        if const:
            return ("enum", const)
    if field_name.lower().endswith("_dob"):
        return ("date", None)
    return ("string", None)


# Endpoints whose body params we expose as KYC-style identity fields. Path
# is the final OpenAPI path; the const name is what we export to TypeScript.
_IDENTITY_FIELD_TARGETS = {
    "/pdax-institution/v1/fiat/deposit": "FIAT_DEPOSIT_IDENTITY_FIELDS",
    "/pdax-institution/v1/fiat/withdraw": "FIAT_WITHDRAW_IDENTITY_FIELDS",
}


def _emit_identity_fields(refs, sections):
    """Emit identity-field arrays for /fiat/deposit and /fiat/withdraw.

    The PDAX client's `getKycRequirements()` returns the union of these
    two arrays; the KycForm renders inputs from them directly. Sourcing
    this from the parsed OpenAPI body schemas keeps the form in sync with
    the docs without hand-maintained field lists in client.ts.
    """
    arrays = []
    for section in sections or []:
        path = section.get("path") or ""
        const_name = _IDENTITY_FIELD_TARGETS.get(path)
        if not const_name:
            continue
        items = []
        for p in section.get("body_params", []) or []:
            name = field_name_of(p)
            if not name:
                continue
            description = clean_description(p.get("description", "") or "") or ""
            kind, enum_const = _identity_field_kind(name, path, refs, description)
            items.append({
                "name": name,
                "required": is_required(p),
                "kind": kind,
                "enumConst": enum_const,
                "description": description,
            })
        if not items:
            continue
        body_lines = []
        for it in items:
            parts = [
                f"name: {json.dumps(it['name'])}",
                f"required: {'true' if it['required'] else 'false'}",
                f"kind: {json.dumps(it['kind'])}",
            ]
            if it.get("enumConst"):
                parts.append(f"enumConst: {json.dumps(it['enumConst'])}")
            if it.get("description"):
                parts.append(f"description: {json.dumps(it['description'])}")
            body_lines.append("    { " + ", ".join(parts) + " }")
        body = "[\n" + ",\n".join(body_lines) + ",\n]"
        arrays.append(
            f"export const {const_name}: readonly IdentityFieldSpec[] = {body};\n"
        )

    if not arrays:
        return None

    enum_union = " | ".join(f"'{c}'" for c in SCHEMA_TO_TS_CONST.values())
    header = (
        "// Required and optional identity fields per fiat endpoint, sourced from\n"
        "// the request-body schemas of /fiat/deposit and /fiat/withdraw. The PDAX\n"
        "// client's getKycRequirements() returns the union of these two arrays;\n"
        "// `enumConst` points at the matching value-set exported above so the\n"
        "// KycForm can render dropdowns without a separate field-to-enum map.\n"
        "export type IdentityFieldKind = 'string' | 'date' | 'enum';\n"
        "export type IdentityFieldEnum = " + enum_union + ";\n"
        "export interface IdentityFieldSpec {\n"
        "    name: string;\n"
        "    required: boolean;\n"
        "    kind: IdentityFieldKind;\n"
        "    enumConst?: IdentityFieldEnum;\n"
        "    description?: string;\n"
        "}\n"
    )
    return header + "\n" + "\n".join(arrays)


def _collect_all_error_codes(refs, sections):
    """Build a {code: {code, name, httpStatus, message}} dict from the
    global error table plus every endpoint's per-response error codes.

    Dedupes by code; global entries (which carry canonical names) win.
    Skips blank-code rows from validation-style tables (the docs include
    a few trailing entries with empty `Response` cells).
    """
    by_code = {}

    for e in refs.get("error_codes", []) or []:
        code = (e.get("code") or "").strip()
        if not code:
            continue
        by_code[code] = {
            "code": code,
            "name": e.get("name", "") or "",
            "httpStatus": e.get("http_status"),
            "message": e.get("message", "") or "",
        }

    for section in sections or []:
        if not section.get("error_codes"):
            continue
        status_lookup = _tag_error_status_lookup(refs, section.get("group"))
        per_endpoint = categorize_error_codes(
            section["error_codes"], status_lookup
        )
        for status, codes in per_endpoint.items():
            for c in codes:
                code = (c.get("code") or "").strip()
                if not code:
                    continue
                if code in by_code:
                    existing = by_code[code]
                    if not existing.get("name") and c.get("name"):
                        existing["name"] = c["name"]
                    if not existing.get("message") and c.get("message"):
                        existing["message"] = c["message"]
                    continue
                by_code[code] = {
                    "code": code,
                    "name": c.get("name") or "",
                    "httpStatus": status,
                    "message": c.get("message") or "",
                }

    return by_code


def _emit_error_codes(refs, sections):
    """Emit the ERROR_CODES table.

    Sources:
      - Global table from the docs' "Error Codes" section (PAP-prefixed).
      - Per-endpoint error responses for every section that carries one
        (Trade OT010xxx codes, Crypto Out OT* codes, Fiat Out validation
        strings).

    Sorted: PAP* codes first by status, then OT* codes lexicographically,
    then everything else (textual validation codes from /fiat/withdraw).
    """
    by_code = _collect_all_error_codes(refs, sections)
    if not by_code:
        return None

    def sort_key(item):
        code = item["code"]
        if code.startswith("PAP"):
            return (0, item["httpStatus"] or 0, code)
        if code.startswith("OT"):
            return (1, code)
        return (2, code)

    items = sorted(by_code.values(), key=sort_key)
    rows = ",\n".join(
        f"    {{ code: {json.dumps(e['code'])}, name: {json.dumps(e['name'])}, "
        f"httpStatus: {e['httpStatus'] if e['httpStatus'] is not None else 'null'}, "
        f"message: {json.dumps(e['message'])} }}"
        for e in items
    )
    return (
        "// Error codes returned by the PDAX API. Includes global PAP* codes plus\n"
        "// per-endpoint OT01xxxx codes from Trade / Crypto Out responses, and the\n"
        "// textual validation codes from /fiat/withdraw (\"Missing identifier\",\n"
        "// \"Invalid sender_phone_number\", etc.). Sorted PAP → OT → textual.\n"
        "export interface ErrorInfo {\n"
        "    code: string;\n"
        "    name: string;\n"
        "    httpStatus: number | null;\n"
        "    message: string;\n"
        "}\n"
        "export const ERROR_CODES: readonly ErrorInfo[] = [\n" + rows + ",\n];\n"
    )


def build_reference_module(refs, sections):
    """Return TypeScript source for src/lib/anchors/pdax/reference.ts."""
    blocks = [TS_HEADER, *_emit_simple_unions(refs)]
    for emit in (
        _emit_fiat_in_methods_info,
        _emit_stellar_tokens,
        _emit_bank_codes,
    ):
        block = emit(refs)
        if block:
            blocks.append(block)
    identity_block = _emit_identity_fields(refs, sections)
    if identity_block:
        blocks.append(identity_block)
    error_block = _emit_error_codes(refs, sections)
    if error_block:
        blocks.append(error_block)
    return "\n".join(blocks)


# ---------------------------------------------------------------------------
# Webhook handling — separates the registration call (which goes in `paths:`)
# from the incoming event payloads (which go in OpenAPI 3.1+'s `webhooks:`
# top-level block).
# ---------------------------------------------------------------------------


def _is_webhook_section(s):
    """Return True for the docs' `Webhook Events for X Transactions` sections.

    Those H2s document the payload PDAX delivers to OUR registered URL — they
    aren't separate endpoints at PDAX, even though they have the same path/method
    as the registration call. The script handles them out of the main `paths:`
    loop and emits them under the OpenAPI 3.1+ `webhooks:` top-level field.
    """
    if s.get("group") != "Webhook":
        return False
    title = (s.get("title") or "").lower()
    return "webhook events for" in title


def _webhook_event_kind(s):
    """Return 'crypto' or 'fiat' (or None) based on the H2 title."""
    title = (s.get("title") or "").lower()
    if "crypto" in title:
        return "crypto"
    if "fiat" in title:
        return "fiat"
    return None


def _extract_webhook_event_schema(s):
    """Pull the 'Schema of <X> Event(s) Data' table off a webhook section."""
    for rs in s.get("response_schemas", []):
        title = (rs.get("title") or "").lower()
        if "event" in title and "data" in title:
            return response_to_schema(rs["fields"])
    return None


def build_webhooks_block(sections):
    """Build OpenAPI 3.1+ `webhooks:` from the webhook-event sections.

    Returns a dict mapping a webhook key (`crypto_transactions`, etc.) to a
    PathItem-shaped object whose `post.requestBody` references the corresponding
    `*WebhookEvent` schema. Returns an empty dict if no webhook sections exist.

    Each operation gets an `operationId` so codegen tools have a stable
    handler name (e.g. `crypto_transactions_webhook`) instead of falling
    back to URL-derived defaults.
    """
    webhooks = {}
    for s in sections:
        if not _is_webhook_section(s):
            continue
        kind = _webhook_event_kind(s)
        if not kind:
            continue
        schema_name = "CryptoWebhookEvent" if kind == "crypto" else "FiatWebhookEvent"
        webhooks[f"{kind}_transactions"] = {
            "post": {
                "summary": s["title"],
                "operationId": f"{kind}_transactions_webhook",
                "description": (
                    f"PDAX delivers this payload to your registered webhook endpoint "
                    f"when a {kind} transaction event occurs. Register your URL via "
                    f"`POST /pdax-institution/v1/config/webhook` to start receiving."
                ),
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {"$ref": schema_ref(schema_name)},
                        }
                    },
                },
                "responses": {
                    "200": {"description": "Webhook acknowledged"},
                },
            }
        }
    return webhooks


def webhook_event_schemas(sections):
    """Pull `{Crypto,Fiat}WebhookEvent` schemas out of the webhook sections."""
    schemas = {}
    for s in sections:
        if not _is_webhook_section(s):
            continue
        kind = _webhook_event_kind(s)
        if not kind:
            continue
        ev_schema = _extract_webhook_event_schema(s)
        if ev_schema is None:
            continue
        name = "CryptoWebhookEvent" if kind == "crypto" else "FiatWebhookEvent"
        schemas[name] = {
            "description": (
                f"Payload PDAX POSTs to your registered webhook endpoint when a "
                f"{kind} transaction reaches a terminal status. The wrapper PDAX "
                f"actually sends has a `data` envelope; the fields below describe "
                f"that inner data object."
            ),
            **ev_schema,
        }
    return schemas


def build_webhook_registration_operation(sections):
    """Build the single `POST /pdax-institution/v1/config/webhook` operation
    that registers a partner URL to receive webhook events. The two webhook
    H2 sections in the docs differ only in their `event_type` value — we
    emit one operation with `event_type` enumerated.
    """
    webhook_sections = [s for s in sections if _is_webhook_section(s)]
    if not webhook_sections:
        return None
    return {
        "summary": "Register webhook endpoint",
        "tags": ["Webhook"],
        "operationId": "register_webhook_endpoint",
        "description": (
            "Register a URL to receive webhook events for fiat or crypto transactions. "
            "Set `event_type` to `crypto` or `fiat`. To receive both, register twice."
        ),
        "security": [{"bearerAuth": [], "idToken": []}],
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "event_type": {
                                "type": "string",
                                "enum": ["crypto", "fiat"],
                                "description": "Which event stream to subscribe to.",
                            },
                            "webhook_endpoint": {
                                "type": "string",
                                "description": "Your deployed webhook endpoint.",
                            },
                        },
                        "required": ["event_type", "webhook_endpoint"],
                    }
                }
            },
        },
        "responses": {
            "200": {"description": "Webhook registered"},
            "400": {"$ref": "#/components/responses/PdaxError400"},
            "401": {"$ref": "#/components/responses/PdaxError401"},
            "500": {"$ref": "#/components/responses/PdaxError500"},
            "503": {"$ref": "#/components/responses/PdaxError503"},
        },
    }


# ---------------------------------------------------------------------------
# Fresh-fetch from the (password-gated) docs site
# ---------------------------------------------------------------------------


def fetch_page_data(url, cookie, output_path):
    """Download the Gatsby page-data.json from the docs site using `cookie`.

    Validates that the response is JSON with the shape we expect — a missing
    or expired cookie typically returns the login page (HTML), not JSON, so
    we detect that and exit with a helpful message rather than overwriting
    the on-disk file with garbage.

    On success, writes the JSON to `output_path` and returns it.
    """
    if not cookie:
        print(
            "✗ Fetch requires the PDAX_DOCS_COOKIE env var (or --cookie).\n"
            "  Log into the docs site, then copy the full `Cookie` header value\n"
            "  from DevTools → Network → any docs-origin request → Request Headers.",
            file=sys.stderr,
        )
        sys.exit(1)

    req = urlrequest.Request(
        url,
        headers={
            "Cookie": cookie,
            "Accept": "application/json",
            "User-Agent": "pdax-openapi-generator/1.0",
        },
    )
    try:
        with urlrequest.urlopen(req, timeout=30) as resp:
            content_type = resp.headers.get("content-type", "")
            body = resp.read()
    except HTTPError as exc:
        print(
            f"✗ Fetch failed: HTTP {exc.code} from {url}\n"
            f"  {exc.reason}\n"
            "  If you got 401/403, your cookie has likely expired — log in again\n"
            "  and refresh PDAX_DOCS_COOKIE.",
            file=sys.stderr,
        )
        sys.exit(1)
    except URLError as exc:
        print(f"✗ Fetch failed: could not reach {url}: {exc.reason}", file=sys.stderr)
        sys.exit(1)

    # If the cookie is bad we usually get a 200 with an HTML login page back.
    if "json" not in content_type.lower() or body[:1] not in (b"{", b"["):
        snippet = body[:200].decode("utf-8", "replace").strip()
        print(
            "✗ Fetch returned non-JSON content — likely an expired cookie or\n"
            f"  a redirect to a login page. content-type={content_type!r}\n"
            f"  First 200 bytes: {snippet!r}",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        print(f"✗ Fetched body is not valid JSON: {exc}", file=sys.stderr)
        sys.exit(1)

    # Sanity check: confirm the Gatsby shape we expect.
    try:
        data["result"]["data"]["markdownRemark"]["htmlAst"]
    except (KeyError, TypeError):
        print(
            "✗ Fetched JSON does not look like a Gatsby page-data file\n"
            "  (missing result.data.markdownRemark.htmlAst). The docs site may have\n"
            "  reorganized — pass a different URL with --fetch-url.",
            file=sys.stderr,
        )
        sys.exit(1)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    # Write the JSON pretty-printed with 4-space indentation. The server
    # sends it as a single dense line; that's a pain to skim or diff.
    with open(output_path, "w") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
        f.write("\n")
    written = output_path.stat().st_size
    print(f"✓ Fetched {len(body):,} bytes ({written:,} on disk after re-formatting)\n  → {output_path}")
    return data


# ---------------------------------------------------------------------------
# Spec validation
# ---------------------------------------------------------------------------


def validate_spec(spec):
    """Validate the generated spec using `openapi-spec-validator`.

    Returns True on success (or skipped), False on validation failure.
    Prints diagnostic info to stderr in either failure case.
    """
    try:
        from openapi_spec_validator import validate
    except ImportError:
        import sys as _sys

        print(
            "⚠ openapi-spec-validator is not installed. Skipping --validate.\n"
            "  Install with: pip install openapi-spec-validator",
            file=_sys.stderr,
        )
        return True
    try:
        validate(spec)
    except Exception as exc:  # the validator raises various subclasses; treat them all as failure
        import sys as _sys

        print(f"✗ Spec validation failed:\n{exc}", file=_sys.stderr)
        return False
    print("✓ Spec validates against OpenAPI 3.x")
    return True


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input", "-i", default=str(DEFAULT_INPUT), help="Path to Gatsby page-data.json"
    )
    parser.add_argument(
        "--output", "-o", default=str(DEFAULT_OUTPUT), help="Output OpenAPI YAML path"
    )
    parser.add_argument(
        "--reference",
        "-r",
        default=str(DEFAULT_REFERENCE),
        help="Output TypeScript reference module path",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help=(
            "Validate the generated spec with `openapi-spec-validator`. "
            "Prints a warning and skips if the package isn't installed; install with "
            "`pip install openapi-spec-validator`."
        ),
    )
    parser.add_argument(
        "--fetch",
        action="store_true",
        help=(
            "Download a fresh page-data.json from the PDAX docs site before generating. "
            "Requires PDAX_DOCS_COOKIE (or --cookie) — copy from DevTools after logging in."
        ),
    )
    parser.add_argument(
        "--fetch-url",
        default=DEFAULT_FETCH_URL,
        help=f"URL to fetch page-data.json from (default: {DEFAULT_FETCH_URL})",
    )
    parser.add_argument(
        "--cookie",
        default=None,
        help="Cookie header value for --fetch. Falls back to PDAX_DOCS_COOKIE env var.",
    )
    args = parser.parse_args()

    if args.fetch:
        cookie = args.cookie or os.environ.get("PDAX_DOCS_COOKIE", "")
        data = fetch_page_data(args.fetch_url, cookie, Path(args.input))
    else:
        with open(args.input) as f:
            data = json.load(f)

    ast = data["result"]["data"]["markdownRemark"]["htmlAst"]
    sections = parse_sections(ast["children"])
    refs = parse_reference_data(ast["children"])

    print(f"Parsed {len(sections)} endpoints:")
    for s in sections:
        print(f"  {s['method']:6s} {s['path'] or '???'}")

    print(
        "\nReference data: "
        f"{len(refs['countries'])} countries, "
        f"{len(refs['bank_codes'])} bank codes, "
        f"{len(refs['error_codes'])} global error codes, "
        f"{len(refs['tokens'])} tokens"
    )

    spec = build_spec(sections, refs=refs)

    with open(args.output, "w") as f:
        yaml.dump(spec, f, default_flow_style=False, sort_keys=False, allow_unicode=True, width=120)

    print(f"\nWrote {args.output}")
    print(f"  Paths: {len(spec['paths'])}")
    print(f"  Operations: {sum(len(v) for v in spec['paths'].values())}")

    ts_source = build_reference_module(refs, sections)
    with open(args.reference, "w") as f:
        f.write(ts_source)
    print(f"\nWrote {args.reference}")

    if args.validate and not validate_spec(spec):
        sys.exit(1)


if __name__ == "__main__":
    main()
