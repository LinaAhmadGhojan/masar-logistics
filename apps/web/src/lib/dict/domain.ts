import { ADMIN } from "./admin";
import { FIN } from "./fin";
import { MISC } from "./misc";
import { OPS } from "./ops";
import { WB } from "./wb";

export const DOMAIN: [string, string, string][] = [...WB, ...OPS, ...FIN, ...ADMIN, ...MISC];
