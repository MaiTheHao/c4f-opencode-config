#!/usr/bin/env python3
"""show_models.py - query models exposed by the OPENCODE harness.

Criteria: {limit: int, model_type: ALL|FREE|PAIDED, allowed: bool}
Allowlist source of truth: allowed_models.json (same directory as this script).
  authorized: list of {id, variants, cost, role, strengths}  (a bare string "id" is also accepted)
    cost      relative routing tier (lower = cheaper), NOT a real price
    variants  list of variant names, or null = provider-dependent
    role      what the model can be assigned to do
    strengths what it is best at
  free:   {cost, role, strengths} describing any *-free model (shown as `*-free` row)
  banned: list of ids, always refused

Classification (pricing cache ~/.cache/opencode/models.json):
  FREE   cost(input,output) == 0; no cost in cache -> id ends with "-free".
         `opencode/big-pickle` is free without the suffix. "-contributor" alone is NOT free.
  PAIDED everything not FREE.
  ALL    everything.

Allowlist matching: base id only (provider prefix ignored, case-insensitive).
  AUTHORIZED       in "authorized"
  BANNED           in "banned" (always wins)
  FREE             not listed but free; allowed like any other model
  UNAUTHORIZED     anything else
Allowlist errors (missing/invalid file) fail closed: exit code 1.

Exit codes for --check: 0 AUTHORIZED or FREE (allowed), 1 BANNED/UNAUTHORIZED/error.
Output (--routing): markdown table (or JSON with --format json) built from allowed_models.json.
Output (listing): native list ['provider/model', ...]; paid ids carry $/M prices.
"""

import argparse
import json
import os
import subprocess
import sys

FREE_SUFFIX = "-free"
ALLOWED_FILE = "allowed_models.json"
EXIT_BY_STATUS = {"AUTHORIZED": 0, "FREE": 0, "BANNED": 1, "UNAUTHORIZED": 1}
ALLOWED_STATUSES = ("AUTHORIZED", "FREE")


# ---------- pricing ----------

def _pricing_cache_path():
    root = os.environ.get("XDG_CACHE_HOME") or os.path.expanduser("~/.cache")
    return os.path.join(root, "opencode", "models.json")


def _load_pricing():
    """{'provider/model': cost_dict}; empty if cache missing/invalid."""
    try:
        with open(_pricing_cache_path()) as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    pricing = {}
    for provider, info in data.items():
        for model_id, meta in (info.get("models") or {}).items():
            cost = meta.get("cost")
            if isinstance(cost, dict) and cost:
                pricing["%s/%s" % (provider, model_id)] = cost
    return pricing


def _is_free(model_id, pricing):
    cost = pricing.get(model_id)
    if cost is not None:
        return float(cost.get("input", 1)) == 0 and float(cost.get("output", 1)) == 0
    return model_id.endswith(FREE_SUFFIX)


# ---------- allowlist ----------

def _base(model_id):
    """Strip provider prefix, lowercase: 'opencode-go/HY3' -> 'hy3'."""
    return model_id.strip().split("/")[-1].lower()


def _load_data():
    """Parse allowed_models.json. Fail closed on any problem."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ALLOWED_FILE)
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError) as e:
        raise SystemExit("ALLOWLIST ERROR (%s): %s: %s" % (path, type(e).__name__, e))


def _load_allowed(data=None):
    """Return (authorized {base_id: meta}, banned set). Fail closed on any problem."""
    data = data if data is not None else _load_data()
    try:
        authorized = {}
        for entry in data["authorized"]:
            meta = {"id": entry} if isinstance(entry, str) else dict(entry)
            authorized[_base(meta["id"])] = meta
        banned = {_base(m) for m in data.get("banned", [])}
    except (KeyError, TypeError, AttributeError, ValueError) as e:
        raise SystemExit("ALLOWLIST ERROR (%s): %s: %s" % (ALLOWED_FILE, type(e).__name__, e))
    if not authorized:
        raise SystemExit("ALLOWLIST ERROR (%s): 'authorized' is empty" % ALLOWED_FILE)
    return authorized, banned


def _cell(v, none="n/a"):
    if v is None:
        return none
    if isinstance(v, (list, tuple)):
        return ", ".join(str(x) for x in v)
    return str(v).replace("|", "/")


def routing_rows():
    """Rows [(model, variants, cost, role, strengths)] sorted by cost; free row last."""
    data = _load_data()
    authorized, _ = _load_allowed(data)
    rows = []
    for meta in authorized.values():
        rows.append((meta["id"], meta.get("variants"), meta.get("cost"),
                     meta.get("role", ""), meta.get("strengths", "")))
    rows.sort(key=lambda r: (r[2] is None, r[2]))
    free = data.get("free")
    if isinstance(free, dict):
        rows.append(("*-free", None, free.get("cost", 0),
                     free.get("role", ""), free.get("strengths", "")))
    return rows


def routing_table(fmt="table"):
    rows = routing_rows()
    if fmt == "json":
        keys = ("model", "variants", "cost", "role", "strengths")
        return json.dumps([dict(zip(keys, r)) for r in rows], indent=2)
    lines = ["| Model | Variants | Cost | Role | Strengths |", "|---|---|---:|---|---|"]
    for r in rows:
        lines.append("| `%s` | %s | %s | %s | %s |" % (
            r[0], _cell(r[1], "provider-dependent"), _cell(r[2]), _cell(r[3]), _cell(r[4])))
    return "\n".join(lines)


def classify(model_id, allowed, pricing):
    authorized, banned = allowed
    base = _base(model_id)
    if base in banned:
        return "BANNED"
    if base in authorized:
        return "AUTHORIZED"
    if _is_free(model_id, pricing):
        return "FREE"
    return "UNAUTHORIZED"


# ---------- querying ----------

def _run_opencode_models():
    result = subprocess.run(["opencode", "models"], capture_output=True, text=True)
    return [l.strip() for l in result.stdout.splitlines() if l.strip() and "/" in l]


def query_models(limit=None, model_type="ALL", allowed_only=False):
    model_type = str(model_type).upper()
    if model_type not in ("ALL", "FREE", "PAIDED"):
        raise ValueError("model_type must be one of {ALL, FREE, PAIDED}, got: %r" % model_type)

    model_ids = _run_opencode_models()
    pricing = _load_pricing()

    if model_type == "FREE":
        model_ids = [m for m in model_ids if _is_free(m, pricing)]
    elif model_type == "PAIDED":
        model_ids = [m for m in model_ids if not _is_free(m, pricing)]

    if allowed_only:
        allowed = _load_allowed()
        model_ids = [m for m in model_ids if classify(m, allowed, pricing) in ALLOWED_STATUSES]

    if limit is not None and int(limit) > 0:
        model_ids = model_ids[: int(limit)]
    return model_ids


def _annotate_prices(model_ids):
    pricing = _load_pricing()
    out = []
    for m in model_ids:
        if _is_free(m, pricing):
            out.append(m)
            continue
        cost = pricing.get(m)
        if cost is not None:
            out.append("%s (in $%s, out $%s)" % (m, cost.get("input"), cost.get("output")))
        else:
            out.append("%s (price n/a)" % m)
    return out


# ---------- CLI ----------

def main(argv=None):
    p = argparse.ArgumentParser(
        description="Query models exposed by the OPENCODE harness.",
        epilog="Examples:\n"
               "  show_models.py -t FREE\n"
               "  show_models.py --allowed\n"
               "  show_models.py --routing\n"
               "  show_models.py --check opencode-go/deepseek-v4.1-flash",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("-l", "--limit", type=int, default=None, help="cap results; 0/omit = no cap")
    p.add_argument("-t", "--model-type", default="ALL", choices=["ALL", "FREE", "PAIDED"],
                   type=str.upper, help="filter by cost type (default ALL)")
    p.add_argument("-a", "--allowed", action="store_true",
                   help="only allowed models: AUTHORIZED in %s, plus any FREE model" % ALLOWED_FILE)
    p.add_argument("-r", "--routing", action="store_true",
                   help="print routing table (model, variants, cost, role, strengths) "
                        "from %s; cost is a relative tier" % ALLOWED_FILE)
    p.add_argument("-f", "--format", default="table", choices=["table", "json"],
                   help="output format for --routing (default table)")
    p.add_argument("-c", "--check", metavar="MODEL_ID",
                   help="print allowlist status of one model id; exit 0 AUTHORIZED/FREE, "
                        "1 BANNED/UNAUTHORIZED")
    args = p.parse_args(argv)

    if args.routing:
        print(routing_table(args.format))
        return 0

    if args.check:
        status = classify(args.check, _load_allowed(), _load_pricing())
        print(status)
        return EXIT_BY_STATUS[status]

    print(repr(_annotate_prices(
        query_models(limit=args.limit, model_type=args.model_type, allowed_only=args.allowed)
    )))
    return 0


if __name__ == "__main__":
    sys.exit(main())