"""Tests for unit-costs and calculations endpoints (Iteration 26)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://oyun-loncasi.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def test_get_unit_costs_default():
    r = requests.get(f"{API}/unit-costs/asker_egitim", timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ["yemek", "odun", "celik", "benzin", "sure_saniye"]:
        assert k in d


def test_put_unit_costs_admin(admin_headers):
    body = {"yemek": 100, "odun": 50, "celik": 30, "benzin": 20, "sure_saniye": 5}
    r = requests.put(f"{API}/unit-costs/asker_egitim", json=body, headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["yemek"] == 100
    assert d["sure_saniye"] == 5
    assert "updated_at" in d
    # verify persisted
    g = requests.get(f"{API}/unit-costs/asker_egitim", timeout=15).json()
    assert g["yemek"] == 100 and g["sure_saniye"] == 5


def test_put_unit_costs_requires_auth():
    r = requests.put(f"{API}/unit-costs/asker_egitim", json={"yemek": 1, "odun": 1, "celik": 1, "benzin": 1, "sure_saniye": 1}, timeout=15)
    assert r.status_code in (401, 403)


def test_calculations_crud(admin_headers):
    # list
    r = requests.get(f"{API}/calculations?category=asker_egitim", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    # create
    body = {"category": "asker_egitim", "soldier_count": 1000, "yemek": 100000, "odun": 50000, "celik": 30000, "benzin": 20000, "sure_saniye": 5000}
    r = requests.post(f"{API}/calculations", json=body, headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "id" in d and "created_at" in d
    calc_id = d["id"]

    # list contains
    lst = requests.get(f"{API}/calculations?category=asker_egitim", timeout=15).json()
    assert any(c["id"] == calc_id for c in lst)

    # delete
    r = requests.delete(f"{API}/calculations/{calc_id}", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    assert r.json().get("deleted") is True

    # delete again -> 404
    r = requests.delete(f"{API}/calculations/{calc_id}", headers=admin_headers, timeout=15)
    assert r.status_code == 404


def test_post_calculation_requires_auth():
    body = {"category": "asker_egitim", "soldier_count": 1, "yemek": 1, "odun": 1, "celik": 1, "benzin": 1, "sure_saniye": 1}
    r = requests.post(f"{API}/calculations", json=body, timeout=15)
    assert r.status_code in (401, 403)
