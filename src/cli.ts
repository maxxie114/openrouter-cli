#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
import { homedir } from "os";
import { join } from "path";

// Load from ~/.openrouter-cli first, then fall back to .env in CWD
loadEnv({ path: join(homedir(), ".openrouter-cli") });
loadEnv(); // CWD .env (for local dev)
import { Command } from "commander";
import {
  OpenRouterManagementClient,
  type KeyData,
  type CreateKeyRequest,
  type UpdateKeyRequest,
} from "./client.js";

// ── helpers ────────────────────────────────────────────────────────────────

function getClient(): OpenRouterManagementClient {
  const key = process.env.OPENROUTER_MANAGEMENT_KEY;
  if (!key) {
    console.error("Error: OPENROUTER_MANAGEMENT_KEY not found.");
    console.error(`Add it to ~/.openrouter-cli:\n  echo 'OPENROUTER_MANAGEMENT_KEY=sk-or-v1-...' >> ~/.openrouter-cli`);
    process.exit(1);
  }
  return new OpenRouterManagementClient(key);
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return String(value);
}

function fmtLimit(key: KeyData): string {
  if (key.limit === null) return "unlimited";
  return `$${key.limit_remaining ?? "?"}/$${key.limit} (${key.limit_reset ?? "?"})`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function printKeyTable(keys: KeyData[]): void {
  if (keys.length === 0) {
    console.log("No keys found.");
    return;
  }

  console.log();
  for (const k of keys) {
    const status = k.disabled ? "disabled" : "active";
    const budget = fmtLimit(k);
    console.log(`  ${k.name}  [${status}]  ${budget}  $${k.usage} used  ${fmtDate(k.created_at)}`);
    console.log(`  ${k.hash}`);
    console.log();
  }
}

function printKeyDetail(k: KeyData): void {
  const rows: [string, string][] = [
    ["Hash",          k.hash],
    ["Name",          k.name],
    ["Status",        k.disabled ? "disabled" : "active"],
    ["Budget",        fmtLimit(k)],
    ["Usage (total)", `$${k.usage}`],
    ["Usage (daily)", k.usage_daily !== undefined ? `$${k.usage_daily}` : "—"],
    ["Created",       fmtDate(k.created_at)],
    ["Updated",       fmtDate(k.updated_at)],
    ["Expires",       fmtDate(k.expires_at)],
  ];
  console.log();
  for (const [label, value] of rows) {
    console.log(`  ${label.padEnd(16)} ${value}`);
  }
  console.log();
}

// Accepts a full hash or a name. If name matches multiple keys, errors out.
async function resolveHash(client: OpenRouterManagementClient, nameOrHash: string): Promise<string> {
  // Hashes are 64-char hex strings — skip the lookup if it looks like one
  if (/^[0-9a-f]{64}$/i.test(nameOrHash)) return nameOrHash;

  const { data: keys } = await client.listKeys({ include_disabled: true });
  const matches = keys.filter((k) => k.name === nameOrHash);

  if (matches.length === 0) throw new Error(`No key found with name "${nameOrHash}"`);
  if (matches.length > 1) {
    const hashes = matches.map((k) => `  ${k.hash}  (${k.name})`).join("\n");
    throw new Error(`Multiple keys named "${nameOrHash}" — use the full hash instead:\n${hashes}`);
  }
  return matches[0].hash;
}

async function run(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("orkeys")
  .description("Manage OpenRouter API keys")
  .version("1.0.0");

// list
program
  .command("list")
  .description("List all API keys")
  .option("-a, --all", "Include disabled keys")
  .action((opts) =>
    run(async () => {
      const keys = await getClient().listKeys({ include_disabled: opts.all });
      printKeyTable(keys.data);
      console.log(`${keys.data.length} key(s) total`);
    })
  );

// create
program
  .command("create <name>")
  .description("Create a new API key")
  .option("-l, --limit <usd>", "Spending limit in USD (e.g. 5)")
  .option("-r, --reset <period>", "Limit reset period: daily | weekly | monthly")
  .option("-e, --expires <date>", "Expiry date in ISO 8601 (e.g. 2026-12-31)")
  .action((name: string, opts) =>
    run(async () => {
      const req: CreateKeyRequest = { name };
      if (opts.limit)   req.limit       = parseFloat(opts.limit);
      if (opts.reset)   req.limit_reset = opts.reset;
      if (opts.expires) req.expires_at  = opts.expires;

      const result = await getClient().createKey(req);
      console.log("\nKey created!");
      console.log(`\n  Secret key (save this — shown only once!):\n  ${result.key}\n`);
      printKeyDetail(result.data);
    })
  );

// get
program
  .command("get <name|hash>")
  .description("Get details for a specific key")
  .action((nameOrHash: string) =>
    run(async () => {
      const client = getClient();
      const hash = await resolveHash(client, nameOrHash);
      const key = await client.getKey(hash);
      printKeyDetail(key);
    })
  );

// update
program
  .command("update <name|hash>")
  .description("Update a key's name, limit, or status")
  .option("-n, --name <name>",      "New name")
  .option("-l, --limit <usd>",      "New spending limit in USD")
  .option("--no-limit",             "Remove spending limit entirely")
  .option("-r, --reset <period>",   "New reset period: daily | weekly | monthly")
  .option("--disable",              "Disable the key")
  .option("--enable",               "Enable the key")
  .action((nameOrHash: string, opts) =>
    run(async () => {
      const req: UpdateKeyRequest = {};
      if (opts.name)            req.name     = opts.name;
      if (opts.disable)         req.disabled = true;
      if (opts.enable)          req.disabled = false;
      if (opts.reset)           req.limit_reset = opts.reset;
      if (opts.limit === false) req.limit    = null;
      else if (opts.limit)      req.limit    = parseFloat(opts.limit);

      if (Object.keys(req).length === 0) {
        console.error("Nothing to update. Provide at least one option (--name, --limit, --disable, etc.)");
        process.exit(1);
      }

      const client = getClient();
      const hash = await resolveHash(client, nameOrHash);
      const updated = await client.updateKey(hash, req);
      console.log("\nKey updated.");
      printKeyDetail(updated);
    })
  );

// delete
program
  .command("delete <name|hash>")
  .description("Permanently delete a key")
  .option("-f, --force", "Skip confirmation prompt")
  .action((nameOrHash: string, opts) =>
    run(async () => {
      const client = getClient();
      const hash = await resolveHash(client, nameOrHash);
      if (!opts.force) {
        const { createInterface } = await import("readline");
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>((resolve) =>
          rl.question(`Delete key "${nameOrHash}"? This cannot be undone. [y/N] `, resolve)
        );
        rl.close();
        if (answer.toLowerCase() !== "y") {
          console.log("Aborted.");
          return;
        }
      }
      await client.deleteKey(hash);
      console.log(`Deleted "${nameOrHash}"`);
    })
  );

program.parse();
