import type { Role } from "./types";

// One-click sign-in cards on the login page (this is a test system, so the passwords are shown on purpose).
export const ACCOUNTS: { role: Role; login: string; password: string }[] = [
  { role: "admin", login: "admin@masar.local", password: "admin1234" },
  { role: "dispatcher", login: "dispatch@masar.app", password: "demo1234" },
  { role: "finance", login: "finance@masar.app", password: "demo1234" },
  { role: "client", login: "client@gulf.app", password: "demo1234" },
  { role: "driver", login: "driver1@masar.app", password: "demo1234" },
];
