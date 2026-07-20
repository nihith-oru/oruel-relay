#!/usr/bin/env python3
"""
Oru'el GPU Relay API — End-to-End Test Suite
============================================

Exercises every documented endpoint of the Oru'el relay API.

Usage:
    export ORUEL_API_KEY="oruel_live_..."
    python test_oruel_api.py                    # smoke tests only (no billable resources)
    python test_oruel_api.py --full             # full E2E incl. real GPU deploy → terminate
    python test_oruel_api.py --base-url URL     # override base URL (e.g. local dev)
    python test_oruel_api.py --verbose          # print every request/response

Exit codes:
    0 = all tests passed
    1 = one or more tests failed
    2 = configuration error
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable

import requests


DEFAULT_BASE_URL = "https://relay.oru-el.com/api"

# Well-formed but obviously-fake key. Do NOT use this for real access.
TEST_SSH_PUBLIC_KEY = (
    "ssh-rsa "
    "AAAAB3NzaC1yc2EAAAADAQABAAABAQC7oruelE2EtestKeyDoNotUseForRealAccess"
    "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ "
    "oruel-api-e2e@test.local"
)


# --------------------------- terminal colors ------------------------------ #

class C:
    RESET = "\033[0m"
    GRAY = "\033[90m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    CYAN = "\033[36m"
    BOLD = "\033[1m"

    @classmethod
    def disable(cls) -> None:
        for k in ("RESET", "GRAY", "RED", "GREEN", "YELLOW", "CYAN", "BOLD"):
            setattr(cls, k, "")


# ------------------------------ context ---------------------------------- #

@dataclass
class Ctx:
    base_url: str
    api_key: str
    verbose: bool = False
    full: bool = False
    poll_timeout_s: int = 300
    passed: int = 0
    failed: int = 0
    failures: list[tuple[str, str]] = field(default_factory=list)
    # cleanup registry — anything we create gets logged here
    ssh_key_ids: list[str] = field(default_factory=list)
    deployment_ids: list[str] = field(default_factory=list)
    volume_ids: list[str] = field(default_factory=list)


# --------------------------- HTTP helper --------------------------------- #

def req(
    ctx: Ctx,
    method: str,
    path: str,
    *,
    expect_status: int | tuple[int, ...] | None = None,
    headers: dict[str, str] | None = None,
    json_body: Any = None,
    params: dict[str, Any] | None = None,
    auth: bool = True,
) -> requests.Response:
    """Send a request, optionally assert status, return the Response."""
    url = ctx.base_url.rstrip("/") + path
    h: dict[str, str] = {"Accept": "application/json"}
    if json_body is not None:
        h["Content-Type"] = "application/json"
    if auth:
        h["X-API-Key"] = ctx.api_key
    if headers:
        h.update(headers)

    if ctx.verbose:
        print(f"{C.GRAY}    → {method} {url}{C.RESET}")
        if params:
            print(f"{C.GRAY}      params: {params}{C.RESET}")
        if json_body is not None:
            preview = json.dumps(json_body)[:300]
            print(f"{C.GRAY}      body: {preview}{C.RESET}")

    t0 = time.time()
    try:
        r = requests.request(method, url, headers=h, json=json_body,
                             params=params, timeout=30)
    except requests.RequestException as e:
        raise AssertionError(f"network error: {e}") from e
    dt_ms = (time.time() - t0) * 1000

    if ctx.verbose:
        print(f"{C.GRAY}      ← {r.status_code} in {dt_ms:.0f}ms{C.RESET}")
        if r.text:
            print(f"{C.GRAY}      {r.text[:400]}{C.RESET}")

    if expect_status is not None:
        expected = (expect_status,) if isinstance(expect_status, int) else expect_status
        if r.status_code not in expected:
            raise AssertionError(
                f"expected status in {expected}, got {r.status_code}: {r.text[:200]}"
            )
    return r


def as_list(body: Any) -> list[Any]:
    """Handle a raw list or a paginated wrapper ({data: [...]} or {volumes: [...]})."""
    if isinstance(body, list):
        return body
    if isinstance(body, dict):
        for key in ("data", "volumes"):
            if isinstance(body.get(key), list):
                return body[key]
    raise AssertionError(
        f"expected list or paginated wrapper, got {type(body).__name__}"
    )

# --------------------------- test runner --------------------------------- #

TEST_REGISTRY: list[tuple[str, Callable[[Ctx], None], bool]] = []  # (name, fn, full_only)


def test(name: str, *, full_only: bool = False):
    def deco(fn: Callable[[Ctx], None]) -> Callable[[Ctx], None]:
        TEST_REGISTRY.append((name, fn, full_only))
        return fn
    return deco


def run_test(ctx: Ctx, name: str, fn: Callable[[Ctx], None]) -> None:
    print(f"{C.CYAN}▶ {name}{C.RESET}")
    t0 = time.time()
    try:
        fn(ctx)
    except AssertionError as e:
        dt_ms = (time.time() - t0) * 1000
        ctx.failed += 1
        ctx.failures.append((name, str(e)))
        print(f"  {C.RED}✗ FAIL{C.RESET} ({dt_ms:.0f}ms) — {e}")
    except Exception as e:  # pragma: no cover — surface unexpected errors
        dt_ms = (time.time() - t0) * 1000
        ctx.failed += 1
        ctx.failures.append((name, f"{type(e).__name__}: {e}"))
        print(f"  {C.RED}✗ ERROR{C.RESET} ({dt_ms:.0f}ms) — {type(e).__name__}: {e}")
    else:
        dt_ms = (time.time() - t0) * 1000
        ctx.passed += 1
        print(f"  {C.GREEN}✓ PASS{C.RESET} ({dt_ms:.0f}ms)")


# ================================ TESTS ================================== #

# ---- auth --------------------------------------------------------------- #

@test("Auth · missing X-API-Key → 401")
def _(ctx: Ctx) -> None:
    req(ctx, "GET", "/gpu-offers", expect_status=401, auth=False)


@test("Auth · bogus X-API-Key → 401")
def _(ctx: Ctx) -> None:
    req(ctx, "GET", "/gpu-offers", expect_status=401, auth=False,
        headers={"X-API-Key": "oruel_live_definitely_not_a_real_key_xxxxxx"})


# ---- gpu offers --------------------------------------------------------- #

@test("Offers · GET /gpu-offers returns paginated catalog")
def _(ctx: Ctx) -> None:
    r = req(ctx, "GET", "/gpu-offers", expect_status=200)
    body = r.json()
    for k in ("data", "total", "page", "limit", "totalPages"):
        assert k in body, f"missing top-level key: {k}"
    assert isinstance(body["data"], list)
    if body["data"]:
        g = body["data"][0]
        for k in ("gpuType", "gpuModel", "displayName", "lowestPrice",
                  "highestPrice", "averagePrice", "providers", "offers"):
            assert k in g, f"gpu group missing '{k}': {sorted(g)}"
        if g["offers"]:
            o = g["offers"][0]
            for k in ("provider", "offerId", "gpuCount", "price", "region",
                      "instanceType"):
                assert k in o, f"offer missing '{k}': {sorted(o)}"


@test("Offers · pagination params respected")
def _(ctx: Ctx) -> None:
    r = req(ctx, "GET", "/gpu-offers",
            params={"page": 1, "limit": 3}, expect_status=200)
    body = r.json()
    assert body["page"] == 1 and body["limit"] == 3
    assert len(body["data"]) <= 3


@test("Offers · search=rtx-4090 narrows results")
def _(ctx: Ctx) -> None:
    r = req(ctx, "GET", "/gpu-offers",
            params={"search": "rtx-4090"}, expect_status=200)
    for g in r.json()["data"]:
        blob = f"{g.get('gpuType', '')} {g.get('displayName', '')}".lower()
        assert "4090" in blob, f"unrelated group in 4090 search: {g.get('gpuType')}"


@test("Offers · instanceType=DEDICATED filters cleanly")
def _(ctx: Ctx) -> None:
    r = req(ctx, "GET", "/gpu-offers",
            params={"instanceType": "DEDICATED"}, expect_status=200)
    for g in r.json()["data"]:
        for o in g["offers"]:
            assert o["instanceType"] == "DEDICATED", \
                f"got {o['instanceType']} inside DEDICATED filter"


@test("Offers · prices are positive & internally consistent (markup applied server-side)")
def _(ctx: Ctx) -> None:
    r = req(ctx, "GET", "/gpu-offers", expect_status=200)
    for g in r.json()["data"]:
        assert g["lowestPrice"] > 0, f"{g['gpuType']} lowestPrice not positive"
        assert g["highestPrice"] >= g["lowestPrice"], \
            f"{g['gpuType']} highestPrice < lowestPrice"
        assert g["lowestPrice"] <= g["averagePrice"] <= g["highestPrice"], \
            f"{g['gpuType']} avg outside [low, high]"


# ---- ssh keys ----------------------------------------------------------- #

@test("SSH keys · GET /ssh-keys lists (possibly empty)")
def _(ctx: Ctx) -> None:
    r = req(ctx, "GET", "/ssh-keys", expect_status=200)
    as_list(r.json())


@test("SSH keys · POST → GET → DELETE roundtrip")
def _(ctx: Ctx) -> None:
    name = f"oruel-e2e-{uuid.uuid4().hex[:8]}"
    r = req(ctx, "POST", "/ssh-keys", expect_status=(200, 201),
            json_body={"name": name, "publicKey": TEST_SSH_PUBLIC_KEY})
    created = r.json()
    key_id = created.get("id") or created.get("keyId")
    assert key_id, f"created key missing id: {created}"
    ctx.ssh_key_ids.append(key_id)

    r = req(ctx, "GET", "/ssh-keys", expect_status=200)
    ids = [k.get("id") or k.get("keyId") for k in as_list(r.json())]
    assert key_id in ids, f"created key {key_id} not in listing"

    req(ctx, "DELETE", f"/ssh-keys/{key_id}", expect_status=(200, 204))
    ctx.ssh_key_ids.remove(key_id)


# ---- deployments -------------------------------------------------------- #

@test("Deployments · GET /deployments returns list")
def _(ctx: Ctx) -> None:
    r = req(ctx, "GET", "/deployments", expect_status=200)
    as_list(r.json())


@test("Deployments · unknown id → 404")
def _(ctx: Ctx) -> None:
    req(ctx, "GET", "/deployments/dep-does-not-exist-9999",
        expect_status=(404, 400))


@test("Deployments · POST with missing fields → 400")
def _(ctx: Ctx) -> None:
    req(ctx, "POST", "/deployments", expect_status=400,
        json_body={"gpuType": "rtx-4090"})  # missing provider, offerId, region, etc.


# ---- volumes ------------------------------------------------------------ #

@test("Volumes · GET /volumes lists")
def _(ctx: Ctx) -> None:
    r = req(ctx, "GET", "/volumes", expect_status=200)
    as_list(r.json())


@test("Volumes · GET /volumes/pricing returns rates")
def _(ctx: Ctx) -> None:
    req(ctx, "GET", "/volumes/pricing", expect_status=200)


# ---- full E2E (--full only) --------------------------------------------- #

@test("E2E · offer → key → deploy → poll → patch → terminate", full_only=True)
def _(ctx: Ctx) -> None:
    # 1. pick the cheapest AVAILABLE dedicated offer
    r = req(ctx, "GET", "/gpu-offers",
            params={"instanceType": "DEDICATED", "sortBy": "price",
                    "sortOrder": "asc", "limit": 20},
            expect_status=200)
    groups = r.json()["data"]
    assert groups, "no gpu offers returned"

    chosen: tuple[dict, dict] | None = None
    for g in groups:
        for o in g["offers"]:
            if o.get("available") and o.get("instanceType") == "DEDICATED":
                chosen = (g, o)
                break
        if chosen:
            break
    assert chosen, "no AVAILABLE dedicated offers found; can't run live deploy"
    g, o = chosen
    print(f"    {C.GRAY}using {o['offerId']} — {g['displayName']} "
          f"@ ${o['price']}/hr in {o['region']}{C.RESET}")

    # 2. upload a fresh ssh key
    key_name = f"oruel-e2e-key-{uuid.uuid4().hex[:8]}"
    r = req(ctx, "POST", "/ssh-keys", expect_status=(200, 201),
            json_body={"name": key_name, "publicKey": TEST_SSH_PUBLIC_KEY})
    key_id = r.json().get("id") or r.json().get("keyId")
    assert key_id
    ctx.ssh_key_ids.append(key_id)

    # 3. launch
    os_opt = (o.get("os_options") or ["ubuntu-22.04"])[0]
    r = req(ctx, "POST", "/deployments", expect_status=(200, 201),
            json_body={
                "provider": o["provider"],
                "offerId": o["offerId"],
                "gpuType": g["gpuType"],
                "gpuCount": o.get("gpuCount", 1),
                "region": o["region"],
                "operatingSystem": os_opt,
                "instanceType": "DEDICATED",
                "sshKeyId": key_id,
                "name": f"e2e-{uuid.uuid4().hex[:6]}",
            })
    dep = r.json()
    dep_id = dep["id"]
    ctx.deployment_ids.append(dep_id)
    print(f"    {C.GRAY}deployment {dep_id} created (status={dep['status']}){C.RESET}")
    assert dep["status"] in ("deploying", "pending", "provisioning"), \
        f"unexpected initial status: {dep['status']}"

    # 4. poll until running or timeout
    deadline = time.time() + ctx.poll_timeout_s
    status = dep["status"]
    while time.time() < deadline:
        time.sleep(10)
        r = req(ctx, "GET", f"/deployments/{dep_id}", expect_status=200)
        status = r.json().get("status")
        print(f"    {C.GRAY}poll: status={status}{C.RESET}")
        if status in ("running", "failed", "terminated"):
            break

    if status == "running":
        # 5. patch the name
        req(ctx, "PATCH", f"/deployments/{dep_id}", expect_status=200,
            json_body={"name": "renamed-by-e2e"})

        # 6. can-terminate probe
        r = req(ctx, "GET", f"/deployments/{dep_id}/can-terminate",
                expect_status=200)
        assert "canTerminate" in r.json()
    else:
        print(f"    {C.YELLOW}note: instance never reached 'running' "
              f"within {ctx.poll_timeout_s}s (status={status}). "
              f"Continuing to teardown.{C.RESET}")

    # 7. delete + verify
    r = req(ctx, "DELETE", f"/deployments/{dep_id}", expect_status=(200, 202))
    body = r.json()
    msg = (body.get("message") or "").lower()
    inner_status = (body.get("deployment") or {}).get("status")
    assert inner_status == "terminated" or "destruction" in msg or "terminat" in msg, \
        f"unexpected delete response: {body}"
    ctx.deployment_ids.remove(dep_id)

    # 8. cleanup key
    req(ctx, "DELETE", f"/ssh-keys/{key_id}", expect_status=(200, 204))
    ctx.ssh_key_ids.remove(key_id)


# ------------------------------ cleanup ---------------------------------- #

def cleanup(ctx: Ctx) -> None:
    if not (ctx.deployment_ids or ctx.volume_ids or ctx.ssh_key_ids):
        return
    print(f"\n{C.YELLOW}Cleaning up leftover resources...{C.RESET}")
    for dep_id in list(ctx.deployment_ids):
        try:
            req(ctx, "DELETE", f"/deployments/{dep_id}",
                expect_status=(200, 202, 404))
            print(f"  · deleted deployment {dep_id}")
        except Exception as e:
            print(f"  {C.RED}· failed to delete deployment {dep_id}: {e}{C.RESET}")
    for vol_id in list(ctx.volume_ids):
        try:
            req(ctx, "DELETE", f"/volumes/{vol_id}",
                expect_status=(200, 204, 404))
            print(f"  · deleted volume {vol_id}")
        except Exception as e:
            print(f"  {C.RED}· failed to delete volume {vol_id}: {e}{C.RESET}")
    for key_id in list(ctx.ssh_key_ids):
        try:
            req(ctx, "DELETE", f"/ssh-keys/{key_id}",
                expect_status=(200, 204, 404))
            print(f"  · deleted ssh key {key_id}")
        except Exception as e:
            print(f"  {C.RED}· failed to delete ssh key {key_id}: {e}{C.RESET}")


# -------------------------------- main ----------------------------------- #

def main() -> None:
    p = argparse.ArgumentParser(
        description="End-to-end test suite for the Oru'el relay API.")
    p.add_argument("--api-key", default=os.environ.get("ORUEL_API_KEY"),
                   help="Relay API key (or set env ORUEL_API_KEY).")
    p.add_argument("--base-url",
                   default=os.environ.get("ORUEL_BASE_URL", DEFAULT_BASE_URL),
                   help=f"API base URL (default: {DEFAULT_BASE_URL}).")
    p.add_argument("--full", action="store_true",
                   help="Include live deploy → poll → terminate (costs real money).")
    p.add_argument("--poll-timeout", type=int, default=300,
                   help="Seconds to wait for deployment to reach 'running' (default 300).")
    p.add_argument("-v", "--verbose", action="store_true",
                   help="Print every request/response.")
    p.add_argument("--no-color", action="store_true", help="Disable ANSI colors.")
    p.add_argument("-y", "--yes", action="store_true",
                   help="Skip the --full confirmation prompt (for CI).")
    args = p.parse_args()

    if args.no_color or not sys.stdout.isatty():
        C.disable()

    if not args.api_key:
        print(f"{C.RED}error: no API key. Pass --api-key or set ORUEL_API_KEY.{C.RESET}",
              file=sys.stderr)
        sys.exit(2)

    ctx = Ctx(
        base_url=args.base_url,
        api_key=args.api_key,
        verbose=args.verbose,
        full=args.full,
        poll_timeout_s=args.poll_timeout,
    )

    masked = f"{args.api_key[:14]}…{args.api_key[-4:]}" \
        if len(args.api_key) > 20 else "***"
    print(f"{C.BOLD}Oru'el Relay API — E2E test suite{C.RESET}")
    print(f"  base_url : {ctx.base_url}")
    print(f"  api_key  : {masked}")
    print(f"  mode     : {'FULL (live deploy)' if args.full else 'smoke (no billing)'}")
    print()

    if args.full and not args.yes:
        print(f"{C.YELLOW}⚠ --full will provision a real GPU instance. "
              f"You will be billed for the runtime.{C.RESET}")
        try:
            input("  Press ENTER to continue, Ctrl-C to abort... ")
        except (KeyboardInterrupt, EOFError):
            print("\naborted.")
            sys.exit(0)
        print()

    tests = [(n, f) for n, f, full_only in TEST_REGISTRY
             if args.full or not full_only]

    t0 = time.time()
    try:
        for name, fn in tests:
            run_test(ctx, name, fn)
    finally:
        cleanup(ctx)

    dt = time.time() - t0
    print()
    print(f"{C.BOLD}Summary:{C.RESET}  "
          f"{C.GREEN}{ctx.passed} passed{C.RESET}  "
          f"{C.RED}{ctx.failed} failed{C.RESET}  "
          f"({dt:.1f}s)")

    if ctx.failures:
        print(f"\n{C.RED}Failures:{C.RESET}")
        for name, err in ctx.failures:
            print(f"  ✗ {name}")
            print(f"    {C.GRAY}{err}{C.RESET}")

    sys.exit(1 if ctx.failed else 0)


if __name__ == "__main__":
    main()