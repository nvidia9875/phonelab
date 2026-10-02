/**
 * 評価の比べ相手: 端末の縮退に使っている規則（agent/stub.ts の choosePlan・readClaim）を、評価と同じ予想に当てる。
 *   cd app/web && npx vite-node scripts/rule-baseline.ts > ../../docs/eval/rule-baseline.json
 * サーバの評価（app/scripts/eval_agent.py）がこの結果を読んで、Gemini と並べる。
 */
import { readFileSync } from "node:fs";
import { choosePlan, readClaim } from "../src/agent/stub";
import { themeById } from "../src/catalog/themes";

interface Item {
  theme: string;
  text: string;
  variable: string;
  direction: string;
  has_reason: boolean;
}

const data = JSON.parse(readFileSync(new URL("../../scripts/eval_data.json", import.meta.url), "utf8")) as { predictions: Item[] };
const rows = data.predictions.map((item) => {
  const theme = themeById(item.theme)!;
  const plan = choosePlan(item.text, theme, []);
  const claim = readClaim(item.text, theme);
  return {
    text: item.text,
    question: plan.questionBack !== null,
    variant: plan.variant.id,
    variable: plan.variant.variable,
    claim_variable: claim.variable,
    claim_direction: claim.direction,
  };
});
process.stdout.write(JSON.stringify({ source: "web/src/agent/stub.ts choosePlan / readClaim", rows }, null, 2) + "\n");
