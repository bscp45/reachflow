"""
vapi.py — Client for the Vapi voice API.

Places outbound calls. The result does not come back on this request; Vapi
posts it to our webhook when the call ends, which is why every call carries
the lead id in metadata.
"""

import os
import httpx
from dataclasses import dataclass

VAPI_BASE_URL = "https://api.vapi.ai"

VAPI_API_KEY = os.getenv("VAPI_API_KEY", "")
VAPI_PHONE_NUMBER_ID = os.getenv("VAPI_PHONE_NUMBER_ID", "")
VAPI_ASSISTANT_ID = os.getenv("VAPI_ASSISTANT_ID", "")

# Language the assistant should speak, per lead
LANGUAGE_NAMES = {
    "english": "English",
    "hindi": "Hindi",
    "telugu": "Telugu",
}


class VapiError(Exception):
    """Vapi rejected the request or was unreachable."""


@dataclass
class CallStarted:
    vapi_call_id: str
    status: str


def is_configured() -> tuple[bool, str | None]:
    """
    Whether Vapi is set up enough to place a call.

    Checked before attempting, so a missing phone number produces a clear
    message rather than an opaque 400 from Vapi.
    """
    if not VAPI_API_KEY:
        return False, "VAPI_API_KEY is not set"
    if not VAPI_ASSISTANT_ID:
        return False, "VAPI_ASSISTANT_ID is not set"
    if not VAPI_PHONE_NUMBER_ID:
        return False, (
            "VAPI_PHONE_NUMBER_ID is not set — no outbound number has been "
            "provisioned yet. Import one into Vapi and add its id to .env."
        )
    return True, None


async def start_call(
    *,
    lead_id: int,
    phone: str,
    lead_name: str,
    language: str = "english",
    client_name: str = "",
) -> CallStarted:
    """
    Place an outbound call.

    The lead id travels in metadata so the webhook can match the result back
    without a separate lookup table. Vapi returns it unchanged in the
    end-of-call report.

    Raises VapiError on anything other than a successful start.
    """
    ok, problem = is_configured()
    if not ok:
        raise VapiError(problem)

    payload = {
        "assistantId": VAPI_ASSISTANT_ID,
        "phoneNumberId": VAPI_PHONE_NUMBER_ID,
        "customer": {
            "number": phone.replace(" ", ""),
            "name": lead_name,
        },
        # Returned verbatim in the webhook — our only link back to the lead
        "metadata": {
            "leadId": lead_id,
            "language": language,
        },
        # Values the assistant's prompt can interpolate
        "assistantOverrides": {
            "variableValues": {
                "leadName": lead_name.split()[0] if lead_name else "there",
                "clientName": client_name,
                "language": LANGUAGE_NAMES.get(language, "English"),
            },
        },
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(
                f"{VAPI_BASE_URL}/call",
                json=payload,
                headers={
                    "Authorization": f"Bearer {VAPI_API_KEY}",
                    "Content-Type": "application/json",
                },
            )
    except httpx.RequestError as exc:
        raise VapiError(f"Could not reach Vapi: {exc}") from exc

    if res.status_code >= 400:
        # Surface Vapi's own message — it is usually specific about what
        # is wrong, e.g. an unprovisioned number or an unverified recipient
        detail = res.text
        try:
            body = res.json()
            detail = body.get("message") or body.get("error") or detail
        except Exception:
            pass
        raise VapiError(f"Vapi rejected the call ({res.status_code}): {detail}")

    data = res.json()
    call_id = data.get("id")
    if not call_id:
        raise VapiError("Vapi accepted the call but returned no call id")

    return CallStarted(vapi_call_id=call_id, status=data.get("status", "queued"))
