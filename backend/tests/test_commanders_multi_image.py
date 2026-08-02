"""Tests for iter 32: multi-image support on Commander model."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN = {"username": "admin", "password": "admin123"}


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=10)
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def created_ids():
    ids = []
    yield ids
    # cleanup
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=10)
    if r.status_code == 200:
        h = {"Authorization": f"Bearer {r.json()['token']}"}
        for cid in ids:
            try:
                requests.delete(f"{BASE_URL}/api/commanders/{cid}", headers=h, timeout=10)
            except Exception:
                pass


def test_create_commander_with_images(auth_headers, created_ids):
    payload = {
        "name": "TEST_MultiImg_Bina",
        "category": "mh_bina",
        "characters": [],
        "description": "test",
        "images": ["https://example.com/a.jpg", "https://example.com/b.jpg", "https://example.com/c.jpg"],
        "image_url": "https://example.com/a.jpg",
    }
    r = requests.post(f"{BASE_URL}/api/commanders", json=payload, headers=auth_headers, timeout=10)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert data["images"] == payload["images"]
    assert data["image_url"] == "https://example.com/a.jpg"
    assert data["category"] == "mh_bina"
    assert "id" in data
    created_ids.append(data["id"])


def test_get_commander_returns_images(auth_headers, created_ids):
    assert created_ids, "prev test must have created one"
    cid = created_ids[0]
    r = requests.get(f"{BASE_URL}/api/commanders", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    items = r.json()
    match = [c for c in items if c.get("id") == cid]
    assert match, f"created commander {cid} not found"
    assert len(match[0]["images"]) == 3


def test_update_commander_images(auth_headers, created_ids):
    cid = created_ids[0]
    new_imgs = ["https://example.com/x.jpg", "https://example.com/y.jpg"]
    r = requests.patch(
        f"{BASE_URL}/api/commanders/{cid}",
        json={"images": new_imgs, "image_url": new_imgs[0]},
        headers=auth_headers,
        timeout=10,
    )
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert data["images"] == new_imgs
    assert data["image_url"] == new_imgs[0]


def test_create_without_images_defaults_empty(auth_headers, created_ids):
    payload = {
        "name": "TEST_NoImg_Tetikci",
        "category": "tetikci",
        "characters": [],
        "description": "test",
    }
    r = requests.post(f"{BASE_URL}/api/commanders", json=payload, headers=auth_headers, timeout=10)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert data.get("images") == []
    created_ids.append(data["id"])


def test_cleanup_old_iter32_record():
    # Delete leftover from main agent's curl test if present
    r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=10)
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    stale = "f35ee83f-7efa-4149-95f2-f431ccd4d374"
    requests.delete(f"{BASE_URL}/api/commanders/{stale}", headers=h, timeout=10)
