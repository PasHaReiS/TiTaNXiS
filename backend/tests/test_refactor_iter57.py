"""Iter57 — Refactor Phase 3 regression: members_admin router + announcements Protocol typing."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "https://oyun-loncasi.preview.emergentagent.com"
API = f"{BASE_URL}/api"

ADMIN = ("admin", "Admin123")
EDITOR = ("pasha", "pasha123")


def _login(user, pwd):
    r = requests.post(f"{API}/auth/login", json={"username": user, "password": pwd}, timeout=15)
    assert r.status_code == 200, f"login {user} → {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def editor_token():
    return _login(*EDITOR)


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def editor_headers(editor_token):
    return {"Authorization": f"Bearer {editor_token}"}


@pytest.fixture(scope="module")
def some_member_ids(admin_headers):
    r = requests.get(f"{API}/members?limit=5", headers=admin_headers, timeout=15)
    assert r.status_code == 200, f"members list → {r.status_code}"
    data = r.json()
    items = data if isinstance(data, list) else data.get("items") or data.get("members") or []
    ids = [m.get("id") for m in items if m.get("id")]
    if not ids:
        pytest.skip("no members available for bulk tests")
    return ids[:2]


# ============ Members Admin (Phase 3 extraction) ============


class TestMembersAdminExtraction:
    def test_member_history_endpoint_returns_shape(self, admin_headers, some_member_ids):
        mid = some_member_ids[0]
        r = requests.get(f"{API}/members/{mid}/history", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert "member" in d and "points" in d and "total" in d and "event_count" in d
        assert isinstance(d["points"], list)
        assert isinstance(d["total"], int)
        # _id must not leak
        assert "_id" not in d["member"]
        for p in d["points"]:
            assert "_id" not in p

    def test_member_history_404(self, admin_headers):
        r = requests.get(f"{API}/members/__nope__zzz/history", headers=admin_headers, timeout=15)
        assert r.status_code == 404

    def test_member_changes_endpoint(self, admin_headers, some_member_ids):
        r = requests.get(f"{API}/members/{some_member_ids[0]}/changes?limit=10", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list)
        for row in d:
            assert "_id" not in row

    def test_member_changes_limit_clamp(self, admin_headers, some_member_ids):
        r = requests.get(f"{API}/members/{some_member_ids[0]}/changes?limit=99999", headers=admin_headers, timeout=15)
        assert r.status_code == 200  # clamped internally to 500

    def test_bulk_country_set_and_clear(self, editor_headers, some_member_ids):
        # SET
        r = requests.post(
            f"{API}/members/bulk-country",
            headers=editor_headers,
            json={"member_ids": some_member_ids, "country": "tr"},
            timeout=15,
        )
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert d["country"] == "TR"
        assert d["matched"] >= 1

        # CLEAR
        r2 = requests.post(
            f"{API}/members/bulk-country",
            headers=editor_headers,
            json={"member_ids": some_member_ids, "country": None},
            timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json()["country"] is None

    def test_bulk_country_invalid(self, editor_headers, some_member_ids):
        r = requests.post(
            f"{API}/members/bulk-country",
            headers=editor_headers,
            json={"member_ids": some_member_ids, "country": "TUR"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_bulk_country_empty_ids(self, editor_headers):
        r = requests.post(
            f"{API}/members/bulk-country",
            headers=editor_headers,
            json={"member_ids": [], "country": "TR"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_bulk_rank_valid_and_invalid(self, editor_headers, some_member_ids):
        # capture original rank so we can restore
        rget = requests.get(f"{API}/members/{some_member_ids[0]}/history", headers=editor_headers, timeout=15)
        orig_rank = rget.json()["member"].get("rank", "R1")

        r = requests.post(
            f"{API}/members/bulk-rank",
            headers=editor_headers,
            json={"member_ids": some_member_ids, "rank": "R3"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["rank"] == "R3"

        # invalid rank
        r2 = requests.post(
            f"{API}/members/bulk-rank",
            headers=editor_headers,
            json={"member_ids": some_member_ids, "rank": "R9"},
            timeout=15,
        )
        assert r2.status_code == 400

        # restore
        requests.post(
            f"{API}/members/bulk-rank",
            headers=editor_headers,
            json={"member_ids": some_member_ids, "rank": orig_rank or "R1"},
            timeout=15,
        )

    def test_bulk_alliance_transfer(self, editor_headers, some_member_ids):
        # snapshot original alliance
        rget = requests.get(f"{API}/members/{some_member_ids[0]}/history", headers=editor_headers, timeout=15)
        orig = rget.json()["member"].get("alliance_name") or "TitanXis"

        r = requests.post(
            f"{API}/members/bulk-alliance",
            headers=editor_headers,
            json={"member_ids": some_member_ids, "alliance_name": orig},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["alliance_name"] == orig

    def test_bulk_alliance_empty_name(self, editor_headers, some_member_ids):
        r = requests.post(
            f"{API}/members/bulk-alliance",
            headers=editor_headers,
            json={"member_ids": some_member_ids, "alliance_name": "   "},
            timeout=15,
        )
        assert r.status_code == 400

    def test_bulk_endpoints_require_edit(self, some_member_ids):
        # no auth
        r = requests.post(
            f"{API}/members/bulk-rank",
            json={"member_ids": some_member_ids, "rank": "R2"},
            timeout=15,
        )
        assert r.status_code in (401, 403)


# ============ Announcements Protocol regression ============


class TestAnnouncementsProtocolRegression:
    def test_list(self, admin_headers):
        r = requests.get(f"{API}/announcements", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, dict) and "items" in d and isinstance(d["items"], list)

    def test_list_urgent_filter(self, admin_headers):
        r = requests.get(f"{API}/announcements?filter=urgent", headers=admin_headers, timeout=15)
        assert r.status_code == 200

    def test_create_patch_revert_delete_flow(self, admin_headers):
        # create no-broadcast
        body = {
            "title": "TEST_ITER57_ANN",
            "body": "phase3 protocol regression",
            "urgent": False,
            "broadcast": False,
        }
        r = requests.post(f"{API}/announcements", headers=admin_headers, json=body, timeout=15)
        assert r.status_code in (200, 201), r.text[:200]
        created = r.json()
        # response wrapped as {"item": {...}}
        item = created.get("item") or created
        aid = item.get("id")
        assert aid
        assert "fanout" not in created  # broadcast=false → no fanout key

        # patch (creates a history snapshot)
        r2 = requests.patch(
            f"{API}/announcements/{aid}",
            headers=admin_headers,
            json={"title": "TEST_ITER57_ANN_EDITED", "body": "edited"},
            timeout=15,
        )
        assert r2.status_code == 200

        # history is embedded in the doc (`history` array), no separate endpoint
        rget = requests.get(f"{API}/announcements?limit=100", headers=admin_headers, timeout=15)
        assert rget.status_code == 200
        found = next((x for x in rget.json().get("items", []) if x.get("id") == aid), None)
        assert found is not None
        assert isinstance(found.get("history") or [], list) and len(found.get("history") or []) >= 1

        # revert (no snap_id — pops last history entry)
        rr = requests.post(f"{API}/announcements/{aid}/revert", headers=admin_headers, timeout=15)
        assert rr.status_code in (200, 204)

        # bulk-delete
        rbd = requests.post(
            f"{API}/announcements/bulk-delete",
            headers=admin_headers,
            json={"ids": [aid]},
            timeout=15,
        )
        assert rbd.status_code == 200

        # bulk-restore
        rbr = requests.post(
            f"{API}/announcements/bulk-restore",
            headers=admin_headers,
            json={"ids": [aid]},
            timeout=15,
        )
        assert rbr.status_code == 200

        # final cleanup: doc was hard-deleted by bulk-delete; bulk-restore is a
        # no-op if the doc is gone (returns restored=0). So we don't DELETE again.


# ============ Regression sweep ============


class TestPhase12Regression:
    @pytest.mark.parametrize(
        "path",
        [
            "/health",
            "/commanders",
            "/alliance-colors",
            "/alliance-scopes",
            "/multiplier-history",
            "/unit-costs/infantry",
            "/legal/privacy?lang=tr",
            "/point-calc?kind=pre",
            "/settings/guild-target",
            "/announcements",
        ],
    )
    def test_endpoint_ok(self, admin_headers, path):
        r = requests.get(f"{API}{path}", headers=admin_headers, timeout=15)
        assert r.status_code == 200, f"{path} → {r.status_code} {r.text[:120]}"

    def test_pc_export(self, admin_headers):
        r = requests.get(f"{API}/point-calc/export?kind=pre", headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert r.content[:2] == b"PK"  # xlsx zip magic
        assert len(r.content) > 500

    def test_reports_csv(self, admin_headers):
        r = requests.get(f"{API}/reports/guild-data.csv", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
