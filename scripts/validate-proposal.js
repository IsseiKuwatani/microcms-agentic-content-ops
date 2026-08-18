import { readJson, getConfig } from "./lib/config.js";
import path from "node:path";

export function validateProposal(proposal) {
  const errors = [];
  if (proposal?.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!/^proposal-[a-f0-9]{16}$/.test(proposal?.proposalId || "")) errors.push("proposalId is invalid");
  if (proposal?.mode !== "proposal-only") errors.push("mode must be proposal-only");
  if (proposal?.humanApprovalRequired !== true) errors.push("humanApprovalRequired must be true");
  if (!/^[a-f0-9]{64}$/.test(proposal?.audit?.fingerprint || "")) errors.push("audit fingerprint is invalid");
  if (proposal?.approval?.status !== "pending") errors.push("approval status must be pending");
  if (!Array.isArray(proposal?.actions)) errors.push("actions must be an array");
  for (const [index, action] of (proposal?.actions || []).entries()) {
    if (action.humanReview !== true || action.status !== "proposal") errors.push(`actions[${index}] must remain human-reviewed proposal`);
  }
  return errors;
}

async function main() {
  const config = getConfig();
  const inputPath = path.resolve(config.root, process.argv[2] || path.join(config.outputDir, "proposals", "next-actions.json"));
  const proposal = await readJson(inputPath);
  const errors = validateProposal(proposal);
  if (errors.length) {
    console.error(JSON.stringify({ valid: false, errors }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ valid: true, proposalId: proposal.proposalId }, null, 2));
}

if (process.argv[1]?.endsWith("validate-proposal.js")) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
