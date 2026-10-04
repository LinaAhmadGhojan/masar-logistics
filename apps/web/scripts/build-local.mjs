// Static build that runs on the in-browser engine (portfolio site / APK):  npm run build:local
import { execSync } from "node:child_process";
execSync("npx next build", { stdio: "inherit", env: { ...process.env, NEXT_PUBLIC_LOCAL: "1" } });
