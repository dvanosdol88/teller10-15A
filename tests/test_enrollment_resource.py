import falcon
from falcon import testing

from python.repository import Repository
from python.resources import EnrollmentResource


class StubTeller:
    """Minimal Teller client stub for enrollment tests."""

    def list_accounts(self, access_token):  # noqa: D401 - simple stub
        return []

    def get_account_balances(self, access_token, account_id):  # pragma: no cover - not used in tests
        return {}

    def get_account_transactions(self, access_token, account_id, count=10):  # pragma: no cover
        return []


def make_client(session_factory):
    app = falcon.App()
    teller = StubTeller()
    app.add_route('/api/enrollments', EnrollmentResource(session_factory, teller))
    return testing.TestClient(app)


def test_enrollment_rejects_missing_fields(session_factory):
    client = make_client(session_factory)

    response = client.simulate_post('/api/enrollments', json={'enrollment': {'user': {'id': 'demo-user'}}})

    assert response.status_code == 400


def test_enrollment_accepts_alias_and_trims_values(session_factory):
    client = make_client(session_factory)

    payload = {
        'access_token': '  demo-token  ',
        'user': {'id': '  demo-user  ', 'name': 'Demo User'},
    }

    response = client.simulate_post('/api/enrollments', json=payload)

    assert response.status_code == 200
    body = response.json
    assert body['user']['id'] == 'demo-user'
    assert body['accounts'] == []

    session = session_factory()
    try:
        repo = Repository(session)
        user = repo.get_user_by_token('demo-token')
        assert user is not None
        assert user.id == 'demo-user'
        assert user.name == 'Demo User'
    finally:
        session.close()
