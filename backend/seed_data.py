"""
seed_data.py — Populate the ReachFlow database with realistic demo data.

Run from the backend folder with the venv active:
    python seed_data.py

WHAT THIS DOES
    Wipes every table, then creates:
      - 1 Super Admin (your existing admin@reachflow.in is preserved)
      - 4 ReachFlow Managers (3 assigned to clients, 1 left unassigned)
      - 4 client companies with deliberately different conversion rates
      - A full hierarchy per client: Owner -> Managers -> Analysts
      - 110 leads spread unevenly across the clients
      - Call logs for agreed and declined leads only
      - Varied permissions so the permission system is actually visible

    Every generated password is written to seed_credentials.txt.
    That file is gitignored and must never be committed.

WARNING
    This deletes all existing data. It asks for confirmation first.
"""

import random
import string
from datetime import datetime, timedelta

from app.database import SessionLocal
from app.models import (
    Client,
    User,
    UserRole,
    Lead,
    LeadStatus,
    Language,
    CallLog,
    AuditLog,
    ManagerClientAssignment,
    ClientPermission,
)
from app.core.security import hash_password, generate_otp_secret

# Deterministic output so repeated runs give the same data.
# Remove this line if you want fresh randomness each run.
random.seed(42)

# The one account we keep alive with its original password.
PRESERVED_ADMIN_EMAIL = "admin@reachflow.in"
PRESERVED_ADMIN_PASSWORD = "ReachFlow@2026"

# Collected as we go, written to disk at the end.
credentials: list[dict] = []


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_password() -> str:
    """Generate a readable but non-trivial password."""
    word = random.choice([
        "Falcon", "Harbor", "Lantern", "Meadow", "Quartz",
        "Summit", "Thicket", "Velvet", "Willow", "Zenith",
        "Cobalt", "Dune", "Ember", "Fjord", "Grove",
    ])
    digits = "".join(random.choices(string.digits, k=4))
    return f"{word}@{digits}"


def make_phone() -> str:
    """Indian mobile number in a consistent display format."""
    prefix = random.choice([70, 72, 73, 74, 80, 81, 87, 88, 90, 91, 93, 96, 98, 99])
    rest = "".join(random.choices(string.digits, k=8))
    return f"+91 {prefix}{rest[:3]} {rest[3:]}"


def record(user: User, password: str, client_name: str | None = None) -> None:
    credentials.append({
        "name": user.name,
        "email": user.email,
        "password": password,
        "role": user.role.value,
        "client": client_name or "-",
    })


# ── Name pools ────────────────────────────────────────────────────────────────

FIRST_NAMES = [
    "Arjun", "Priya", "Rohit", "Sneha", "Karan", "Divya", "Vikram", "Ananya",
    "Sanjay", "Pooja", "Rahul", "Meera", "Aditya", "Kavya", "Nikhil", "Sunita",
    "Rajesh", "Preethi", "Deepak", "Lakshmi", "Harish", "Swati", "Manish",
    "Nisha", "Aryan", "Ritu", "Suresh", "Geeta", "Mohit", "Ranjita", "Varun",
    "Anjali", "Kiran", "Neha", "Sandeep", "Tara", "Yash", "Ishita", "Gaurav",
    "Shreya", "Naveen", "Pallavi", "Rakesh", "Sridevi", "Abhishek", "Madhavi",
]

LAST_NAMES = [
    "Mehta", "Sharma", "Verma", "Pillai", "Bose", "Nair", "Rao", "Singh",
    "Gupta", "Iyer", "Das", "Krishnan", "Joshi", "Reddy", "Patel", "Kumar",
    "Mishra", "Venkat", "Chandra", "Agarwal", "Tiwari", "Bansal", "Khanna",
    "Desai", "Sinha", "Roy", "Malhotra", "Chopra", "Kapoor", "Menon",
]

_used_names: set[str] = set()


def make_name() -> str:
    """Unique full name."""
    for _ in range(500):
        name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
        if name not in _used_names:
            _used_names.add(name)
            return name
    # Fallback if the pool is exhausted
    name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)} {len(_used_names)}"
    _used_names.add(name)
    return name


def email_for(name: str, domain: str) -> str:
    first, last = name.split()[0].lower(), name.split()[-1].lower()
    return f"{first}.{last}@{domain}"


# ── Client definitions ────────────────────────────────────────────────────────
# conversion drives how many of that client's leads end up 'agreed'.
# assign_manager=False means you get to wire it up through the UI yourself.

CLIENTS = [
    {
        "name": "Finedge Capital",
        "domain": "finedge.in",
        "conversion": 0.31,   # strong performer
        "lead_share": 0.30,
        "assign_manager": True,
    },
    {
        "name": "BlueStar Realty",
        "domain": "bluestar.in",
        "conversion": 0.22,
        "lead_share": 0.28,
        "assign_manager": True,
    },
    {
        "name": "Zenith Ventures",
        "domain": "zenith.in",
        "conversion": 0.14,
        "lead_share": 0.24,
        "assign_manager": False,   # you assign this one
    },
    {
        "name": "Apex Investments",
        "domain": "apexinv.in",
        "conversion": 0.08,   # struggling — makes the overview panel interesting
        "lead_share": 0.18,
        "assign_manager": False,   # you assign this one
    },
]

TOTAL_LEADS = 110


# ── Transcript templates ──────────────────────────────────────────────────────

AGREED_TRANSCRIPTS = [
    [
        ("AI", "Hello, am I speaking with {name}?"),
        ("Lead", "Yes, speaking."),
        ("AI", "I'm calling from {client} about an investment opportunity. Do you have two minutes?"),
        ("Lead", "Sure, go ahead."),
        ("AI", "Our plans start at five thousand rupees a month with projected returns around eighteen percent annually. Would you like to speak with an advisor?"),
        ("Lead", "That sounds interesting. Please have someone call me."),
    ],
    [
        ("AI", "Hi {name}, this is {client} calling about a portfolio opportunity."),
        ("Lead", "I was actually expecting this call."),
        ("AI", "Wonderful. Our current offering has a three year lock-in with strong historical performance."),
        ("Lead", "I'd like to start with fifty thousand. Send me the paperwork."),
    ],
    [
        ("AI", "Good afternoon, is this {name}?"),
        ("Lead", "It is, yes."),
        ("AI", "I'm reaching out from {client} regarding a tax-saving investment before the financial year closes."),
        ("Lead", "How much are we talking about?"),
        ("AI", "Minimum entry is ten thousand rupees, and it qualifies under section 80C."),
        ("Lead", "Alright, I'm interested. Let's proceed."),
    ],
]

DECLINED_TRANSCRIPTS = [
    [
        ("AI", "Hello, am I speaking with {name}?"),
        ("Lead", "Who is this?"),
        ("AI", "I'm calling from {client} regarding an investment opportunity."),
        ("Lead", "I'm not interested. Please remove my number from your list."),
    ],
    [
        ("AI", "Hi {name}, calling from {client} about a savings plan."),
        ("Lead", "I already have an advisor, thanks. Not looking to change."),
    ],
    [
        ("AI", "Good morning, is this a good time to talk about your investments?"),
        ("Lead", "No, it isn't. I'm at work and I'd rather not get these calls."),
        ("AI", "Understood, I'll note that down. Apologies for the interruption."),
    ],
]

AGREED_SUMMARIES = [
    "Lead expressed clear interest and requested an advisor callback. High conversion probability — follow up within 24 hours.",
    "Lead committed to an initial investment and asked for documentation. Hand off to the sales team immediately.",
    "Lead responded positively to the tax-saving angle. Warm prospect, schedule a follow-up before month end.",
]

DECLINED_SUMMARIES = [
    "Lead explicitly declined and requested removal. Mark as do-not-call and drop from all active campaigns.",
    "Lead already has an existing advisor relationship. Not a fit at this time — revisit in six months.",
    "Lead declined due to timing rather than product fit. Worth a retry after the standard cooling period.",
]


# ── Wipe ──────────────────────────────────────────────────────────────────────

def wipe(db) -> None:
    """
    Delete everything, in foreign-key-safe order.
    Children before parents, or Postgres rejects the delete.
    """
    print("Wiping existing data...")
    for model, label in [
        (CallLog, "call logs"),
        (Lead, "leads"),
        (ClientPermission, "client permissions"),
        (ManagerClientAssignment, "manager assignments"),
        (AuditLog, "audit logs"),
        (User, "users"),
        (Client, "clients"),
    ]:
        count = db.query(model).delete()
        print(f"  removed {count} {label}")
    db.commit()


# ── Seed ──────────────────────────────────────────────────────────────────────

def seed(db) -> None:
    now = datetime.utcnow()

    # ── Super Admin ───────────────────────────────────────────────────────────
    super_admin = User(
        name="Super Admin",
        email=PRESERVED_ADMIN_EMAIL,
        hashed_password=hash_password(PRESERVED_ADMIN_PASSWORD),
        role=UserRole.super_admin,
        client_id=None,
        otp_secret=generate_otp_secret(),
        otp_verified=False,
        is_active=True,
    )
    db.add(super_admin)
    db.flush()
    record(super_admin, PRESERVED_ADMIN_PASSWORD)
    print(f"Created Super Admin: {PRESERVED_ADMIN_EMAIL}")

    # ── ReachFlow Managers ────────────────────────────────────────────────────
    managers: list[User] = []
    for i in range(4):
        name = make_name()
        pwd = make_password()
        mgr = User(
            name=name,
            email=email_for(name, "reachflow.in"),
            hashed_password=hash_password(pwd),
            role=UserRole.reachflow_manager,
            client_id=None,
            otp_secret=generate_otp_secret(),
            otp_verified=False,
            is_active=True,
        )
        db.add(mgr)
        db.flush()
        managers.append(mgr)
        record(mgr, pwd)
    db.commit()
    print(f"Created {len(managers)} ReachFlow Managers")
    print(f"  {managers[3].email} is intentionally left with no client assignments")

    # ── Clients and their people ──────────────────────────────────────────────
    client_rows: list[Client] = []
    # client_id -> list of client_manager Users, used later for lead assignment
    managers_by_client: dict[int, list[User]] = {}

    for spec in CLIENTS:
        client = Client(
            name=spec["name"],
            email=f"admin@{spec['domain']}",
            is_active=True,
            created_at=now - timedelta(days=random.randint(60, 240)),
        )
        db.add(client)
        db.flush()
        client_rows.append(client)

        # Client Owner — always full permissions
        owner_name = make_name()
        owner_pwd = make_password()
        owner = User(
            name=owner_name,
            email=email_for(owner_name, spec["domain"]),
            hashed_password=hash_password(owner_pwd),
            role=UserRole.client_owner,
            client_id=client.id,
            otp_secret=generate_otp_secret(),
            otp_verified=False,
            is_active=True,
        )
        db.add(owner)
        db.flush()
        record(owner, owner_pwd, client.name)

        db.add(ClientPermission(
            user_id=owner.id,
            client_id=client.id,
            can_upload_leads=True,
            can_start_campaign=True,
            can_view_transcripts=True,
            can_manage_analysts=True,
            can_export_data=True,
            granted_by=super_admin.id,
        ))

        # Client Managers — permissions deliberately vary
        client_managers: list[User] = []
        for m_idx in range(random.randint(2, 3)):
            cm_name = make_name()
            cm_pwd = make_password()
            cm = User(
                name=cm_name,
                email=email_for(cm_name, spec["domain"]),
                hashed_password=hash_password(cm_pwd),
                role=UserRole.client_manager,
                client_id=client.id,
                otp_secret=generate_otp_secret(),
                otp_verified=False,
                is_active=True,
            )
            db.add(cm)
            db.flush()
            client_managers.append(cm)
            record(cm, cm_pwd, client.name)

            # First manager at each client is fully enabled.
            # The rest are restricted, so the permission checks are observable.
            fully_enabled = (m_idx == 0)
            db.add(ClientPermission(
                user_id=cm.id,
                client_id=client.id,
                can_upload_leads=fully_enabled,
                can_start_campaign=fully_enabled,
                can_view_transcripts=True,
                can_manage_analysts=True,
                can_export_data=True,
                granted_by=owner.id,
            ))

            # Analysts under this manager
            for a_idx in range(random.randint(2, 3)):
                an_name = make_name()
                an_pwd = make_password()
                analyst = User(
                    name=an_name,
                    email=email_for(an_name, spec["domain"]),
                    hashed_password=hash_password(an_pwd),
                    role=UserRole.client_analyst,
                    client_id=client.id,
                    otp_secret=generate_otp_secret(),
                    otp_verified=False,
                    is_active=True,
                )
                db.add(analyst)
                db.flush()
                record(analyst, an_pwd, client.name)

                # Most analysts are read-only. Roughly one in three can upload,
                # so permission inheritance is visible in the UI.
                can_upload = (a_idx == 0 and fully_enabled)
                db.add(ClientPermission(
                    user_id=analyst.id,
                    client_id=client.id,
                    can_upload_leads=can_upload,
                    can_start_campaign=False,
                    can_view_transcripts=True,
                    can_manage_analysts=False,
                    can_export_data=True,
                    granted_by=cm.id,
                ))

        managers_by_client[client.id] = client_managers
        db.commit()
        print(f"Created client {client.name} with {len(client_managers)} managers")

    # ── Manager -> client assignments ─────────────────────────────────────────
    # Only the first three ReachFlow Managers get assignments.
    # Zenith and Apex are left unassigned on purpose, for you to wire up.
    assigned = 0
    for idx, spec in enumerate(CLIENTS):
        if not spec["assign_manager"]:
            continue
        client = client_rows[idx]
        # Finedge gets two managers, to prove one client can have several
        chosen = managers[:2] if idx == 0 else [managers[idx % 3]]
        for mgr in chosen:
            db.add(ManagerClientAssignment(
                manager_id=mgr.id,
                client_id=client.id,
                assigned_by=super_admin.id,
            ))
            assigned += 1
    db.commit()
    print(f"Created {assigned} manager-client assignments")
    print("  Zenith Ventures and Apex Investments left unassigned for manual setup")

    # ── Leads ─────────────────────────────────────────────────────────────────
    languages = [Language.english, Language.hindi, Language.telugu]
    total_created = 0
    call_logs_created = 0

    for idx, spec in enumerate(CLIENTS):
        client = client_rows[idx]
        count = round(TOTAL_LEADS * spec["lead_share"])
        conv = spec["conversion"]
        cms = managers_by_client[client.id]

        for _ in range(count):
            # Status distribution derived from this client's conversion rate.
            roll = random.random()
            if roll < conv:
                status = LeadStatus.agreed
            elif roll < conv + 0.30:
                status = LeadStatus.declined
            elif roll < conv + 0.48:
                status = LeadStatus.no_answer
            elif roll < conv + 0.53:
                status = LeadStatus.pending_approval
            elif roll < conv + 0.56:
                status = LeadStatus.calling
            else:
                status = LeadStatus.pending

            has_been_called = status in (
                LeadStatus.agreed, LeadStatus.declined, LeadStatus.no_answer
            )

            if status == LeadStatus.agreed:
                attempts = random.randint(1, 2)
                score = random.randint(72, 97)
                sentiment = random.randint(68, 95)
            elif status == LeadStatus.declined:
                attempts = random.randint(1, 3)
                score = random.randint(5, 32)
                sentiment = random.randint(8, 34)
            elif status == LeadStatus.no_answer:
                attempts = random.randint(1, 4)
                score = random.randint(35, 62)
                sentiment = None
            elif status == LeadStatus.calling:
                attempts = 1
                score = random.randint(40, 70)
                sentiment = None
            else:
                attempts = 0
                score = 0.0
                sentiment = None

            last_called = None
            next_retry = None
            if has_been_called:
                last_called = now - timedelta(
                    days=random.randint(0, 21),
                    hours=random.randint(0, 23),
                    minutes=random.randint(0, 59),
                )
                if status == LeadStatus.no_answer:
                    next_retry = last_called + timedelta(hours=2)
                elif status == LeadStatus.declined:
                    next_retry = last_called + timedelta(days=30)

            lead_name = make_name()
            owner_cm = random.choice(cms) if cms else None

            lead = Lead(
                name=lead_name,
                phone=make_phone(),
                status=status,
                attempts=attempts,
                score=float(score),
                sentiment=float(sentiment) if sentiment is not None else None,
                language=random.choice(languages),
                last_called=last_called,
                next_retry=next_retry,
                ndnc_checked=has_been_called,
                is_ndnc=False,
                client_id=client.id,
                assigned_to=owner_cm.id if owner_cm else None,
                uploaded_by=owner_cm.id if owner_cm else None,
                created_at=now - timedelta(days=random.randint(1, 45)),
            )
            db.add(lead)
            db.flush()
            total_created += 1

            # Call history only for agreed and declined.
            # A no-answer lead with a transcript would be a data bug.
            if status in (LeadStatus.agreed, LeadStatus.declined):
                if status == LeadStatus.agreed:
                    template = random.choice(AGREED_TRANSCRIPTS)
                    summary = random.choice(AGREED_SUMMARIES)
                    duration = random.randint(95, 240)
                else:
                    template = random.choice(DECLINED_TRANSCRIPTS)
                    summary = random.choice(DECLINED_SUMMARIES)
                    duration = random.randint(25, 85)

                transcript = "\n".join(
                    f"{speaker}: {text.format(name=lead_name.split()[0], client=client.name)}"
                    for speaker, text in template
                )

                started = last_called or now
                db.add(CallLog(
                    lead_id=lead.id,
                    started_at=started,
                    ended_at=started + timedelta(seconds=duration),
                    duration=duration,
                    status=status,
                    transcript=transcript,
                    summary=summary,
                    sentiment=float(sentiment) if sentiment is not None else None,
                    vapi_call_id=f"demo-{lead.id}-{random.randint(1000, 9999)}",
                    language=lead.language,
                ))
                call_logs_created += 1

        db.commit()
        print(f"  {client.name}: {count} leads")

    print(f"Created {total_created} leads and {call_logs_created} call logs")


# ── Credentials file ──────────────────────────────────────────────────────────

def write_credentials() -> None:
    path = "seed_credentials.txt"
    order = {
        "super_admin": 0,
        "reachflow_manager": 1,
        "client_owner": 2,
        "client_manager": 3,
        "client_analyst": 4,
    }
    rows = sorted(credentials, key=lambda c: (order[c["role"]], c["client"], c["name"]))

    with open(path, "w", encoding="utf-8") as f:
        f.write("ReachFlow — seeded login credentials\n")
        f.write(f"Generated {datetime.now():%Y-%m-%d %H:%M}\n")
        f.write("\nDO NOT COMMIT THIS FILE.\n")
        f.write("=" * 78 + "\n\n")

        current = None
        for row in rows:
            if row["role"] != current:
                current = row["role"]
                f.write(f"\n{current.replace('_', ' ').upper()}\n")
                f.write("-" * 78 + "\n")
            f.write(f"{row['name']:<26} {row['email']:<38} {row['password']:<16} {row['client']}\n")

    print(f"\nWrote {len(rows)} credentials to {path}")


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 78)
    print("ReachFlow database seeder")
    print("=" * 78)
    print("\nThis DELETES all existing data in the database and replaces it.")
    answer = input("Type 'yes' to continue: ").strip().lower()
    if answer != "yes":
        print("Cancelled. Nothing was changed.")
        return

    db = SessionLocal()
    try:
        wipe(db)
        print()
        seed(db)
        write_credentials()
        print("\nDone. Log in with any account listed in seed_credentials.txt.")
    except Exception:
        db.rollback()
        print("\nSeeding failed — all changes rolled back.")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()