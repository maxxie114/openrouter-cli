// OpenRouter Management API client
// Management keys can only manage sub-keys — they cannot make LLM completions.

export interface KeyData {
  hash: string;
  name: string;
  label?: string;
  disabled: boolean;
  limit: number | null;
  limit_remaining: number | null;
  limit_reset: "daily" | "weekly" | "monthly" | null;
  include_byok_in_limit?: boolean;
  // Usage fields returned as flat numbers
  usage: number;
  usage_daily?: number;
  usage_weekly?: number;
  usage_monthly?: number;
  byok_usage?: number;
  byok_usage_daily?: number;
  byok_usage_weekly?: number;
  byok_usage_monthly?: number;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  creator_user_id?: string;
}

export interface ListKeysResponse {
  data: KeyData[];
}

export interface CreateKeyRequest {
  name: string;
  limit?: number;
  limit_reset?: "daily" | "weekly" | "monthly";
  include_byok_in_limit?: boolean;
  expires_at?: string; // ISO 8601
}

export interface CreateKeyResponse {
  key: string; // The actual secret — only shown once!
  data: KeyData;
}

export interface UpdateKeyRequest {
  name?: string;
  disabled?: boolean;
  limit?: number | null;
  limit_reset?: "daily" | "weekly" | "monthly" | null;
  include_byok_in_limit?: boolean;
}

export class OpenRouterManagementClient {
  private readonly baseUrl = "https://openrouter.ai/api/v1";

  constructor(private readonly managementKey: string) {
    if (!managementKey) throw new Error("Management key is required");
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.managementKey}`,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`OpenRouter API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /** List all sub-keys under this management key. */
  listKeys(options?: {
    offset?: number;
    include_disabled?: boolean;
  }): Promise<ListKeysResponse> {
    const params = new URLSearchParams();
    if (options?.offset !== undefined)
      params.set("offset", String(options.offset));
    if (options?.include_disabled)
      params.set("include_disabled", "true");
    const qs = params.size ? `?${params}` : "";
    return this.request<ListKeysResponse>("GET", `/keys${qs}`);
  }

  /** Create a new sub-key. The returned `key` string is shown only once. */
  createKey(data: CreateKeyRequest): Promise<CreateKeyResponse> {
    return this.request<CreateKeyResponse>("POST", "/keys", data);
  }

  /** Get metadata for a specific sub-key by its hash. */
  async getKey(hash: string): Promise<KeyData> {
    const res = await this.request<{ data: KeyData }>("GET", `/keys/${hash}`);
    return res.data;
  }

  /** Update a sub-key's name, limit, or disabled status. */
  async updateKey(hash: string, data: UpdateKeyRequest): Promise<KeyData> {
    const res = await this.request<{ data: KeyData }>("PATCH", `/keys/${hash}`, data);
    return res.data;
  }

  /** Permanently delete a sub-key. */
  deleteKey(hash: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>("DELETE", `/keys/${hash}`);
  }
}
