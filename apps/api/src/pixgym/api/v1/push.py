"""Powiadomienia push: subskrypcja telefonu i powiadomienie próbne."""

from fastapi import APIRouter, HTTPException, status

from pixgym.api.deps import UserId
from pixgym.api.v1.training import _run
from pixgym.schemas import PushEndpoint, PushSubscriptionIn
from pixgym.services import push

router = APIRouter()


def _key() -> str:
    try:
        return push.public_key()
    except push.PushOff:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "push_off") from None


@router.get("/push/key")
async def key(user_id: UserId) -> dict[str, str]:
    return {"key": _key()}


@router.post("/push/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
async def subscribe(body: PushSubscriptionIn, user_id: UserId) -> None:
    _key()
    await _run(user_id, push.subscribe, user_id, body.model_dump())


@router.post("/push/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(body: PushEndpoint, user_id: UserId) -> None:
    await _run(user_id, push.unsubscribe, body.endpoint)


@router.post("/push/test")
async def test(body: PushEndpoint, user_id: UserId) -> dict[str, int]:
    """Próbne powiadomienie od Bita na wskazany telefon."""
    _key()
    msg = {"title": "🤖 Bit", "body": "Działa! Tak będę Ci przypominał o jutrze.", "url": "/#/ja"}

    def subs(conn):
        return [s for s in push._subscriptions(conn) if s["endpoint"] == body.endpoint]

    found = await _run(user_id, subs)
    if not found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not_found")
    return {"sent": await push.deliver(user_id, found, [msg])}
