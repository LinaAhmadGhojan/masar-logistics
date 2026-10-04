import type { Lang } from "../format";
import { BASE } from "./base";
import { DOMAIN } from "./domain";

const build = (idx: 1 | 2) => Object.fromEntries([...BASE, ...DOMAIN].map((r) => [r[0], r[idx]]));

export const DICT: Record<Lang, Record<string, string>> = { ar: build(1), en: build(2) };
