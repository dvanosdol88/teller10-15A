"""Tests for manual data functionality (rent_roll).

Tests repository layer and resource layer for Phase 1 manual data implementation.
"""
import datetime as dt
from decimal import Decimal

from sqlalchemy import text
from python.repository import Repository


def test_get_manual_data_nonexistent(repo, session):
    """Test getting manual data for account with no record returns nulls."""
    user = repo.upsert_user(
        user_id="test_user_manual_001",
        access_token="test_token_manual_001",
        name="Manual Data User"
    )
    
    account_payload = {
        "id": "acc_manual_001",
        "name": "Test Account",
        "type": "depository",
        "currency": "USD"
    }
    account = repo.upsert_account(user, account_payload)
    session.flush()
    
    manual_data = repo.get_manual_data("acc_manual_001")
    
    assert manual_data["account_id"] == "acc_manual_001"
    assert manual_data["rent_roll"] is None
    assert manual_data["updated_at"] is None


def test_upsert_manual_data_create(repo, session):
    """Test creating new manual data record."""
    user = repo.upsert_user(
        user_id="test_user_manual_002",
        access_token="test_token_manual_002",
        name="Manual Data User 2"
    )
    
    account_payload = {
        "id": "acc_manual_002",
        "name": "Test Account 2",
        "type": "depository",
        "currency": "USD"
    }
    account = repo.upsert_account(user, account_payload)
    session.flush()
    
    manual_data = repo.upsert_manual_data("acc_manual_002", Decimal("2500.00"))
    session.flush()
    
    assert manual_data["account_id"] == "acc_manual_002"
    assert manual_data["rent_roll"] == Decimal("2500.00")
    assert manual_data["updated_at"] is not None
    assert isinstance(manual_data["updated_at"], dt.datetime)
    
    result = session.execute(
        text("SELECT rent_roll, updated_at FROM manual_data WHERE account_id = :account_id"),
        {"account_id": "acc_manual_002"}
    ).fetchone()
    
    assert result is not None
    assert float(result[0]) == 2500.00


def test_upsert_manual_data_update(repo, session):
    """Test updating existing manual data record."""
    user = repo.upsert_user(
        user_id="test_user_manual_003",
        access_token="test_token_manual_003",
        name="Manual Data User 3"
    )
    
    account_payload = {
        "id": "acc_manual_003",
        "name": "Test Account 3",
        "type": "depository",
        "currency": "USD"
    }
    account = repo.upsert_account(user, account_payload)
    session.flush()
    
    manual_data_1 = repo.upsert_manual_data("acc_manual_003", Decimal("1500.00"))
    session.flush()
    first_updated_at = manual_data_1["updated_at"]
    
    manual_data_2 = repo.upsert_manual_data("acc_manual_003", Decimal("2000.00"))
    session.flush()
    
    assert manual_data_2["account_id"] == "acc_manual_003"
    assert manual_data_2["rent_roll"] == Decimal("2000.00")
    assert manual_data_2["updated_at"] > first_updated_at
    
    count = session.execute(
        text("SELECT COUNT(*) FROM manual_data WHERE account_id = :account_id"),
        {"account_id": "acc_manual_003"}
    ).scalar()
    
    assert count == 1


def test_upsert_manual_data_rounding(repo, session):
    """Test that rent_roll is rounded to 2 decimals."""
    user = repo.upsert_user(
        user_id="test_user_manual_004",
        access_token="test_token_manual_004",
        name="Manual Data User 4"
    )
    
    account_payload = {
        "id": "acc_manual_004",
        "name": "Test Account 4",
        "type": "depository",
        "currency": "USD"
    }
    account = repo.upsert_account(user, account_payload)
    session.flush()
    
    manual_data = repo.upsert_manual_data("acc_manual_004", Decimal("2500.999"))
    session.flush()
    
    assert manual_data["rent_roll"] == Decimal("2501.00")


def test_upsert_manual_data_null_clears(repo, session):
    """Test that null value clears rent_roll."""
    user = repo.upsert_user(
        user_id="test_user_manual_005",
        access_token="test_token_manual_005",
        name="Manual Data User 5"
    )
    
    account_payload = {
        "id": "acc_manual_005",
        "name": "Test Account 5",
        "type": "depository",
        "currency": "USD"
    }
    account = repo.upsert_account(user, account_payload)
    session.flush()
    
    repo.upsert_manual_data("acc_manual_005", Decimal("3000.00"))
    session.flush()
    
    manual_data = repo.upsert_manual_data("acc_manual_005", None)
    session.flush()
    
    assert manual_data["account_id"] == "acc_manual_005"
    assert manual_data["rent_roll"] is None
    assert manual_data["updated_at"] is not None


def test_upsert_manual_data_negative_value_rejected(repo, session):
    """Test that negative rent_roll is rejected."""
    user = repo.upsert_user(
        user_id="test_user_manual_006",
        access_token="test_token_manual_006",
        name="Manual Data User 6"
    )
    
    account_payload = {
        "id": "acc_manual_006",
        "name": "Test Account 6",
        "type": "depository",
        "currency": "USD"
    }
    account = repo.upsert_account(user, account_payload)
    session.flush()
    
    try:
        repo.upsert_manual_data("acc_manual_006", Decimal("-100.00"))
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "non-negative" in str(e)


def test_get_manual_data_existing(repo, session):
    """Test getting existing manual data returns correct data."""
    user = repo.upsert_user(
        user_id="test_user_manual_007",
        access_token="test_token_manual_007",
        name="Manual Data User 7"
    )
    
    account_payload = {
        "id": "acc_manual_007",
        "name": "Test Account 7",
        "type": "depository",
        "currency": "USD"
    }
    account = repo.upsert_account(user, account_payload)
    session.flush()
    
    repo.upsert_manual_data("acc_manual_007", Decimal("4500.00"))
    session.flush()
    
    manual_data = repo.get_manual_data("acc_manual_007")
    
    assert manual_data["account_id"] == "acc_manual_007"
    assert manual_data["rent_roll"] == Decimal("4500.00")
    assert manual_data["updated_at"] is not None
