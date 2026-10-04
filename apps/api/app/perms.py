"""Role -> permission map. Permissions are checked on the server; the web app only uses them to hide menus."""

ROLES = ("admin", "dispatcher", "finance", "client", "driver")

ALL = [
    "dashboard",
    "waybills.read", "waybills.write", "waybills.all", "waybills.post", "waybills.cancel",
    "dispatch", "delivery", "tracking",
    "billing", "invoices.read", "invoices.write", "payments", "cod",
    "senders.read", "senders.write", "consignees.read", "consignees.write",
    "drivers.read", "drivers.write", "vehicles.read", "vehicles.write",
    "tariffs.read", "tariffs.write",
    "reports", "users", "settings", "audit",
    "jobs",
]

ROLE_PERMS: dict[str, list[str]] = {
    "admin": ALL,
    "dispatcher": [
        "dashboard", "waybills.read", "waybills.write", "waybills.all", "waybills.post", "waybills.cancel",
        "dispatch", "delivery", "tracking",
        "senders.read", "senders.write", "consignees.read", "consignees.write",
        "drivers.read", "drivers.write", "vehicles.read", "vehicles.write",
        "tariffs.read", "reports",
    ],
    "finance": [
        "dashboard", "waybills.read", "waybills.all",
        "billing", "invoices.read", "invoices.write", "payments", "cod",
        "senders.read", "consignees.read", "drivers.read",
        "tariffs.read", "tariffs.write", "reports",
    ],
    "client": [
        "dashboard", "waybills.read", "waybills.write", "waybills.post", "waybills.cancel",
        "consignees.read", "consignees.write", "senders.read",
        "invoices.read", "tracking", "reports",
    ],
    "driver": ["jobs"],
}


def perms_of(role: str) -> list[str]:
    return ROLE_PERMS.get(role, [])
