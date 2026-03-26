import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OpenRouterManagementClient,
  type KeyData,
  type CreateKeyResponse,
  type ListKeysResponse,
} from "./client.js";

const FAKE_KEY = "sk-or-v1-test";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

const baseKeyData: KeyData = {
  hash: "abc123",
  name: "test-key",
  disabled: false,
  limit: 10,
  limit_remaining: 9.5,
  limit_reset: "monthly",
  usage: 0.5,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  expires_at: null,
};

describe("OpenRouterManagementClient", () => {
  let client: OpenRouterManagementClient;

  beforeEach(() => {
    client = new OpenRouterManagementClient(FAKE_KEY);
    vi.stubGlobal("fetch", mockFetch(200, {}));
  });

  // --- constructor ---

  it("throws if management key is empty", () => {
    expect(() => new OpenRouterManagementClient("")).toThrow(
      "Management key is required"
    );
  });

  // --- listKeys ---

  it("GET /keys with no options", async () => {
    const response: ListKeysResponse = { data: [baseKeyData] };
    vi.stubGlobal("fetch", mockFetch(200, response));

    const result = await client.listKeys();

    expect(fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/keys",
      expect.objectContaining({ method: "GET" })
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].hash).toBe("abc123");
  });

  it("GET /keys passes offset and include_disabled query params", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { data: [] }));

    await client.listKeys({ offset: 20, include_disabled: true });

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("offset=20");
    expect(url).toContain("include_disabled=true");
  });

  // --- createKey ---

  it("POST /keys with required name only", async () => {
    const response: CreateKeyResponse = {
      key: "sk-or-v1-new-secret",
      data: { ...baseKeyData, name: "my-key" },
    };
    vi.stubGlobal("fetch", mockFetch(201, response));

    const result = await client.createKey({ name: "my-key" });

    expect(fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/keys",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "my-key" }),
      })
    );
    expect(result.key).toBe("sk-or-v1-new-secret");
    expect(result.data.name).toBe("my-key");
  });

  it("POST /keys with all options", async () => {
    const request = {
      name: "limited-key",
      limit: 5,
      limit_reset: "daily" as const,
      include_byok_in_limit: true,
      expires_at: "2026-12-31T23:59:59Z",
    };
    vi.stubGlobal("fetch", mockFetch(201, { key: "sk-or-v1-x", data: baseKeyData }));

    await client.createKey(request);

    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    expect(body).toMatchObject(request);
  });

  // --- getKey ---

  it("GET /keys/:hash", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { data: baseKeyData }));

    const result = await client.getKey("abc123");

    expect(fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/keys/abc123",
      expect.objectContaining({ method: "GET" })
    );
    expect(result.hash).toBe("abc123");
  });

  // --- updateKey ---

  it("PATCH /keys/:hash sends only provided fields", async () => {
    const updated = { ...baseKeyData, name: "renamed", disabled: true };
    vi.stubGlobal("fetch", mockFetch(200, { data: updated }));

    const result = await client.updateKey("abc123", {
      name: "renamed",
      disabled: true,
    });

    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    expect(body).toEqual({ name: "renamed", disabled: true });
    expect(result.name).toBe("renamed");
  });

  it("PATCH /keys/:hash can remove limit by passing null", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { data: { ...baseKeyData, limit: null } }));

    await client.updateKey("abc123", { limit: null });

    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    expect(body.limit).toBeNull();
  });

  // --- deleteKey ---

  it("DELETE /keys/:hash returns { deleted: true }", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { deleted: true }));

    const result = await client.deleteKey("abc123");

    expect(fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/keys/abc123",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(result.deleted).toBe(true);
  });

  // --- error handling ---

  it("throws on non-2xx responses with status and body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      })
    );

    await expect(client.listKeys()).rejects.toThrow(
      "OpenRouter API error 401: Unauthorized"
    );
  });

  it("includes Authorization header on every request", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { data: [] }));

    await client.listKeys();

    const headers = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
      .headers;
    expect(headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
  });
});
