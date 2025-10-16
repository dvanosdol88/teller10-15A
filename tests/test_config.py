"""Tests for config endpoint and feature flags."""
import os
import pytest
from python.teller import create_app, parse_args
from falcon import testing


@pytest.fixture
def app():
    """Create test app with minimal config."""
    os.environ["TELLER_APPLICATION_ID"] = "test_app_id"
    os.environ["TELLER_ENVIRONMENT"] = "development"
    os.environ.pop("FEATURE_USE_BACKEND", None)
    
    args = parse_args([])
    return create_app(args)


@pytest.fixture
def client(app):
    """Create test client."""
    return testing.TestClient(app)


def test_config_endpoint_default_feature_flag(client):
    """Test that FEATURE_USE_BACKEND defaults to false."""
    result = client.simulate_get("/api/config")
    
    assert result.status_code == 200
    assert "FEATURE_USE_BACKEND" in result.json
    assert result.json["FEATURE_USE_BACKEND"] is False


def test_config_endpoint_with_feature_enabled():
    """Test that FEATURE_USE_BACKEND=true is correctly parsed."""
    os.environ["TELLER_APPLICATION_ID"] = "test_app_id"
    os.environ["TELLER_ENVIRONMENT"] = "development"
    os.environ["FEATURE_USE_BACKEND"] = "true"
    
    args = parse_args([])
    app = create_app(args)
    client = testing.TestClient(app)
    
    result = client.simulate_get("/api/config")
    
    assert result.status_code == 200
    assert result.json["FEATURE_USE_BACKEND"] is True
    
    os.environ.pop("FEATURE_USE_BACKEND", None)


def test_config_endpoint_with_feature_disabled():
    """Test that FEATURE_USE_BACKEND=false is correctly parsed."""
    os.environ["TELLER_APPLICATION_ID"] = "test_app_id"
    os.environ["TELLER_ENVIRONMENT"] = "development"
    os.environ["FEATURE_USE_BACKEND"] = "false"
    
    args = parse_args([])
    app = create_app(args)
    client = testing.TestClient(app)
    
    result = client.simulate_get("/api/config")
    
    assert result.status_code == 200
    assert result.json["FEATURE_USE_BACKEND"] is False
    
    os.environ.pop("FEATURE_USE_BACKEND", None)


def test_config_contains_all_required_fields(client):
    """Test that config endpoint returns all required fields."""
    result = client.simulate_get("/api/config")
    
    assert result.status_code == 200
    data = result.json
    
    assert "applicationId" in data
    assert "environment" in data
    assert "apiBaseUrl" in data
    assert "FEATURE_USE_BACKEND" in data
    assert "FEATURE_MANUAL_DATA" in data
    
    assert data["applicationId"] == "test_app_id"
    assert data["environment"] == "development"
    assert data["apiBaseUrl"] == "/api"
