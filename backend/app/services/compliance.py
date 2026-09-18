"""
compliance.py — TRAI rules that gate every outbound call.

Two checks run before any call is placed:

  1. Call window — TRAI restricts commercial calls to 9am–9pm IST
  2. NDNC register — numbers on the register must not be called

The NDNC lookup is stubbed. Access to the register requires registering as
a telemarketer with TRAI, which is a weeks-long process. The interface is
real and wired into the call flow; only the lookup itself is pending, so
swapping in the live check later touches one function.
"""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from dataclasses import dataclass
import os

IST = ZoneInfo("Asia/Kolkata")

# Read from .env so the window can be adjusted without a code change
CALL_WINDOW_START = int(os.getenv("CALL_WINDOW_START_HOUR", "9"))
CALL_WINDOW_END = int(os.getenv("CALL_WINDOW_END_HOUR", "21"))


@dataclass
class ComplianceResult:
    """Whether a call may be placed, and why not if it may not."""
    allowed: bool
    reason: str | None = None
    retry_after: datetime | None = None


def now_ist() -> datetime:
    """Current time in IST, regardless of where the server runs."""
    return datetime.now(IST)


def within_call_window(at: datetime | None = None) -> bool:
    """
    Whether the given moment falls inside the permitted calling hours.

    Times are evaluated in IST. A server running in UTC would otherwise
    allow calls at 3am local time for the person being called.
    """
    at = (at or now_ist()).astimezone(IST)
    return time(CALL_WINDOW_START, 0) <= at.time() < time(CALL_WINDOW_END, 0)


def next_window_open(at: datetime | None = None) -> datetime:
    """
    The next moment calling becomes permitted.

    Used to schedule a retry rather than dropping the call — a lead that
    comes up for calling at 10pm should be tried at 9am, not discarded.
    """
    at = (at or now_ist()).astimezone(IST)
    today_open = at.replace(
        hour=CALL_WINDOW_START, minute=0, second=0, microsecond=0
    )

    # Before this morning's window — wait for it to open today
    if at < today_open:
        return today_open

    # After this evening's close — tomorrow morning
    return today_open + timedelta(days=1)


def is_on_ndnc(phone: str) -> bool:
    """
    Whether this number is on the National Do Not Call register.

    STUB. Returns False for every number.

    The live check requires TRAI telemarketer registration before the
    register becomes accessible. Until that comes through this cannot be
    implemented, so it fails open rather than blocking every call.

    That is the right trade for a demo with consented recipients and the
    wrong one for production — this must return a real answer before any
    call goes to a number whose owner has not explicitly agreed.
    """
    return False


def check_call_allowed(phone: str, at: datetime | None = None) -> ComplianceResult:
    """
    Run every compliance check for one number.

    Called immediately before placing a call rather than at scheduling
    time, because the window can close between the two.
    """
    if is_on_ndnc(phone):
        return ComplianceResult(
            allowed=False,
            reason="This number is on the National Do Not Call register",
        )

    if not within_call_window(at):
        reopen = next_window_open(at)
        return ComplianceResult(
            allowed=False,
            reason=(
                f"Outside the permitted calling window "
                f"({CALL_WINDOW_START}:00–{CALL_WINDOW_END}:00 IST). "
                f"Next opportunity {reopen:%d %b at %H:%M} IST."
            ),
            retry_after=reopen,
        )

    return ComplianceResult(allowed=True)
