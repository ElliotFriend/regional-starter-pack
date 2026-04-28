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
"""

import argparse
import json
import re
from pathlib import Path

import yaml

SCRIPT_DIR = Path(__file__).resolve().parent
ANCHOR_DIR = SCRIPT_DIR.parent.parent / "src" / "lib" / "anchors" / "pdax"
DEFAULT_INPUT = SCRIPT_DIR / "page-data.json"
DEFAULT_OUTPUT = ANCHOR_DIR / "openapi.yaml"
DEFAULT_REFERENCE = ANCHOR_DIR / "reference.ts"


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
                if "body" in h4:
                    current_section["body_params"] = table_data
                elif "query" in h4:
                    current_section["query_params"] = table_data
                elif "path" in h4:
                    current_section["path_params"] = table_data
                elif "response" in h4 or "payload" in h4:
                    current_section["response_schemas"].append(
                        {"title": current_h4, "fields": table_data}
                    )
                elif "error" in h4:
                    current_section["error_codes"] = table_data
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
        bank_codes, error_codes
    """
    refs = {
        "countries": [],
        "sources_of_funds": [],
        "fee_types": [],
        "sex_values": [],
        "purposes": [],
        "relationships": [],
        "fiat_in_methods": [],
        "fiat_out_methods": [],
        "tokens": [],  # [{"symbol": ..., "network": ...}]
        "bank_codes": [],  # [{"entity_type": ..., "name": ..., "code": ...}]
        "error_codes": [],  # [{"code": ..., "name": ..., "http_status": ..., "message": ...}]
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
                # First row is header; remaining rows: take col 0
                for cells in rows[1:]:
                    if cells and cells[0]:
                        refs["fiat_in_methods"].append(cells[0])
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

    # Dedupe (preserve order)
    for k, v in list(refs.items()):
        if not v or not isinstance(v[0], str):
            continue
        seen = set()
        deduped = []
        for item in v:
            if item not in seen:
                seen.add(item)
                deduped.append(item)
        refs[k] = deduped

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


def resolve_enum(field_name, path, refs):
    """Return an enum list for a body/query field if we know the accepted values."""
    if not refs:
        return None
    name = field_name.lower()
    p = (path or "").lower()

    if name == "purpose":
        return refs["purposes"] or None
    if name == "source_of_funds":
        return refs["sources_of_funds"] or None
    if name == "fee_type":
        return refs["fee_types"] or None
    if name == "relationship_of_sender_to_beneficiary":
        return refs["relationships"] or None
    if name.endswith("_sex"):
        return refs["sex_values"] or None
    if "country" in name or name.endswith("nationality"):
        return refs["countries"] or None
    if name.endswith("bank_code"):
        return [b["code"] for b in refs["bank_codes"]] or None

    # Context-dependent: method differs between fiat-in and fiat-out
    if name == "method":
        if "/fiat/deposit" in p or "fiat-in" in p:
            return refs["fiat_in_methods"] or None
        if "/fiat/withdraw" in p or "fiat-out" in p:
            return refs["fiat_out_methods"] or None

    # Trade endpoints reference any token via base_currency / quote_currency.
    if name in ("currency", "base_currency", "quote_currency") and "/trade" in p:
        return [t["symbol"] for t in refs["tokens"]] or None
    # Crypto withdraw / deposit
    if name == "currency" and "/crypto" in p:
        return [t["symbol"] for t in refs["tokens"]] or None

    return None


def params_to_schema(params, path=None, refs=None):
    properties = {}
    required = []
    for p in params:
        name = (p.get("parameter") or p.get("key") or p.get("name") or "").strip()
        if not name:
            continue
        prop = {"type": map_type(p.get("type", "string"))}
        desc = p.get("description", "")
        if desc:
            prop["description"] = desc
        enum = resolve_enum(name, path, refs)
        if enum:
            prop["enum"] = enum
        properties[name] = prop
        req_val = (
            p.get("required", "") or p.get("required_or_optional", "")
        ).lower().strip()
        if req_val.startswith("required"):
            required.append(name)
    schema = {"type": "object", "properties": properties}
    if required:
        schema["required"] = required
    return schema


def response_to_schema(fields):
    properties = {}
    for f in fields:
        name = (f.get("key") or f.get("parameter") or f.get("name") or "").strip()
        if not name:
            continue
        prop = {"type": map_type(f.get("type", "string"))}
        desc = f.get("description", "")
        if desc:
            prop["description"] = desc
        properties[name] = prop
    return {"type": "object", "properties": properties}


def render_error_table(rows):
    """Render a per-endpoint error table as a markdown bullet list for a response description."""
    lines = []
    for r in rows:
        # Normalise the various formats: {Code, Name, HTTP Status, Message}
        # / {Key, Type} / {Response, HTTP Status Code, Description}
        code = (
            r.get("code")
            or r.get("key")
            or r.get("response")
            or r.get("name")
            or ""
        ).strip()
        msg = (
            r.get("message")
            or r.get("description")
            or r.get("type")
            or ""
        ).strip()
        status = (
            r.get("http_status") or r.get("http_status_code") or ""
        )
        if not code and not msg:
            continue
        prefix = f"`{code}`" if code else ""
        if status:
            prefix = f"{prefix} ({status})" if prefix else f"({status})"
        lines.append(f"- {prefix}{': ' if prefix else ''}{msg}")
    return "\n".join(lines) if lines else None


# ---------------------------------------------------------------------------
# Build the spec
# ---------------------------------------------------------------------------

def build_spec(sections, refs=None):
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
        "components": {
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
        },
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
            name = (p.get("parameter") or p.get("key") or p.get("name") or "").strip()
            if not name:
                continue
            schema = {"type": map_type(p.get("type", "string"))}
            enum = resolve_enum(name, path, refs)
            if enum:
                schema["enum"] = enum
            param = {"name": name, "in": "query", "schema": schema}
            if p.get("description"):
                param["description"] = p["description"]
            if p.get("required", "").lower().strip() in ("yes", "true", "required"):
                param["required"] = True
            parameters.append(param)

        for p in s["path_params"]:
            name = (p.get("parameter") or p.get("key") or p.get("name") or "").strip()
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

        # Responses
        responses = {}
        for i, rs in enumerate(s["response_schemas"]):
            schema = response_to_schema(rs["fields"])
            desc = rs["title"] or "Successful response"
            resp = {
                "description": desc,
                "content": {"application/json": {"schema": schema}},
            }
            if i == 0:
                responses["200"] = resp
            elif "error" in desc.lower():
                responses["400"] = resp
            else:
                responses[f"20{i}"] = resp

        # Attach first example
        if s["response_examples"] and "200" in responses:
            try:
                example = json.loads(s["response_examples"][0])
                responses["200"]["content"]["application/json"]["example"] = example
            except json.JSONDecodeError:
                pass

        if not responses:
            responses["200"] = {"description": "Successful response"}

        # Per-endpoint error tables — surface as a 4xx response description.
        if s.get("error_codes"):
            err_md = render_error_table(s["error_codes"])
            if err_md:
                responses["4XX"] = {
                    "description": "Error responses\n\n" + err_md,
                }

        responses["401"] = {"description": "Unauthorized - invalid or expired token"}

        operation["responses"] = responses

        spec["paths"].setdefault(path, {})[method] = operation

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


def build_reference_module(refs):
    """Return TypeScript source for src/lib/anchors/pdax/reference.ts."""
    stellar_tokens = [t for t in refs["tokens"] if t["network"].lower() == "stellar"]
    other_count = len(refs["tokens"]) - len(stellar_tokens)

    sections = []

    sections.append(
        "// Generated from PDAX page-data.json by generate-openapi.py — do not edit directly.\n"
        "// Regenerate with: python3 src/lib/anchors/pdax/generate-openapi.py\n"
    )

    def const_union(const_name, type_name, values, comment=None):
        block = ""
        if comment:
            block += f"// {comment}\n"
        block += f"export const {const_name} = {_ts_string_array(values)} as const;\n"
        block += f"export type {type_name} = (typeof {const_name})[number];\n"
        return block

    if refs["sources_of_funds"]:
        sections.append(const_union("SOURCES_OF_FUNDS", "SourceOfFunds", refs["sources_of_funds"]))
    if refs["fee_types"]:
        sections.append(const_union("FEE_TYPES", "FeeType", refs["fee_types"]))
    if refs["sex_values"]:
        sections.append(const_union("SEX_VALUES", "Sex", refs["sex_values"]))
    if refs["purposes"]:
        sections.append(const_union("PURPOSES", "Purpose", refs["purposes"]))
    if refs["relationships"]:
        sections.append(
            const_union("RELATIONSHIPS", "RelationshipOfSenderToBeneficiary", refs["relationships"])
        )
    if refs["fiat_in_methods"]:
        sections.append(const_union("FIAT_IN_METHODS", "FiatInMethod", refs["fiat_in_methods"]))
    if refs["fiat_out_methods"]:
        sections.append(const_union("FIAT_OUT_METHODS", "FiatOutMethod", refs["fiat_out_methods"]))
    if refs["countries"]:
        sections.append(const_union("COUNTRIES", "Country", refs["countries"]))

    if stellar_tokens:
        comment = (
            f"Crypto tokens supported by PDAX, filtered to Stellar network only.\n"
            f"// PDAX supports {other_count} additional tokens on other networks "
            f"(Ethereum, Solana, Polygon, etc.) — see openapi.yaml for the full list."
        )
        sections.append(
            f"// {comment}\n"
            "export interface CryptoToken {\n"
            "    symbol: string;\n"
            "    network: string;\n"
            "}\n"
            f"export const STELLAR_TOKENS: readonly CryptoToken[] = "
            f"{_ts_object_array(stellar_tokens, ['symbol', 'network'])};\n"
        )

    if refs["bank_codes"]:
        sections.append(
            "// Bank codes used by /fiat/withdraw `beneficiary_bank_code`.\n"
            "// Includes traditional banks and e-wallet rails.\n"
            "export interface BankInfo {\n"
            "    code: string;\n"
            "    name: string;\n"
            "    entityType: string;\n"
            "}\n"
            f"export const BANK_CODES: readonly BankInfo[] = "
            f"{_ts_object_array([{'code': b['code'], 'name': b['name'], 'entityType': b['entity_type']} for b in refs['bank_codes']], ['code', 'name', 'entityType'])};\n"
        )

    if refs["error_codes"]:
        sections.append(
            "// Global error codes from the PDAX API.\n"
            "export interface ErrorInfo {\n"
            "    code: string;\n"
            "    name: string;\n"
            "    httpStatus: number | null;\n"
            "    message: string;\n"
            "}\n"
            "export const ERROR_CODES: readonly ErrorInfo[] = [\n"
            + ",\n".join(
                f"    {{ code: {json.dumps(e['code'])}, name: {json.dumps(e['name'])}, "
                f"httpStatus: {e['http_status'] if e['http_status'] is not None else 'null'}, "
                f"message: {json.dumps(e['message'])} }}"
                for e in refs["error_codes"]
            )
            + ",\n];\n"
        )

    return "\n".join(sections)


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
    args = parser.parse_args()

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

    ts_source = build_reference_module(refs)
    with open(args.reference, "w") as f:
        f.write(ts_source)
    print(f"\nWrote {args.reference}")


if __name__ == "__main__":
    main()
