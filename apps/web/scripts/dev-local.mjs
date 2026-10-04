// Dev server that runs entirely on the in-browser engine (no API needed):  npm run dev:local
import { spawn } from "node:child_process";
spawn("npx", ["next", "dev", "-p", "3021"], { stdio: "inherit", shell: true, env: { ...process.env, NEXT_PUBLIC_LOCAL: "1" } });
