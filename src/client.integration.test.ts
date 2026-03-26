/**
 * Integration tests — hit the real OpenRouter API.
 * Run with: npm run test:integration
 * Requires OPENROUTER_MANAGEMENT_KEY in .env
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import { OpenRouterManagementClient } from "./client.js";

config();

const managementKey = process.env.OPENROUTER_MANAGEMENT_KEY ?? "";

describe.skipIf(!managementKey)("OpenRouter Management API (integration)", () => {
  let client: OpenRouterManagementClient;
  let createdKeyHash: string;

  beforeAll(() => {
    client = new OpenRouterManagementClient(managementKey);
  });

  afterAll(async () => {
    // Clean up: delete the key created during tests
    if (createdKeyHash) {
      await client.deleteKey(createdKeyHash).catch(() => {});
    }
  });

  it("lists existing keys", async () => {
    const result = await client.listKeys();
    expect(result).toHaveProperty("data");
    expect(Array.isArray(result.data)).toBe(true);
    console.log(`Found ${result.data.length} existing key(s)`);
  });

  it("creates a key with a spending limit", async () => {
    const result = await client.createKey({
      name: "integration-test-key",
      limit: 1,         // $1 max spend
      limit_reset: "monthly",
    });

    expect(result.key).toMatch(/^sk-or-v1-/);
    expect(result.data.name).toBe("integration-test-key");
    expect(result.data.limit).toBe(1);
    expect(result.data.limit_reset).toBe("monthly");
    expect(typeof result.data.usage).toBe("number");

    createdKeyHash = result.data.hash;
    console.log(`Created key hash: ${createdKeyHash}`);
    console.log("Key (only shown once):", result.key);
  });

  it("fetches the created key by hash", async () => {
    const key = await client.getKey(createdKeyHash);
    expect(key.hash).toBe(createdKeyHash);
    expect(key.name).toBe("integration-test-key");
  });

  it("updates the key name and disables it", async () => {
    const updated = await client.updateKey(createdKeyHash, {
      name: "integration-test-key-disabled",
      disabled: true,
    });
    expect(updated.name).toBe("integration-test-key-disabled");
    expect(updated.disabled).toBe(true);
  });

  it("re-enables the key and removes the spending limit", async () => {
    const updated = await client.updateKey(createdKeyHash, {
      disabled: false,
      limit: null,
    });
    expect(updated.disabled).toBe(false);
    expect(updated.limit).toBeNull();
  });

  it("deletes the key", async () => {
    const result = await client.deleteKey(createdKeyHash);
    expect(result.deleted).toBe(true);
    createdKeyHash = ""; // prevent afterAll double-delete
  });
});
