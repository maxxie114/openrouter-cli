# openrouter-cli

A command-line tool for managing [OpenRouter](https://openrouter.ai) API keys using a management key.

## Requirements

- Node.js 18+
- An OpenRouter management key (`sk-or-v1-...`) from your [OpenRouter dashboard](https://openrouter.ai/settings/keys)

## Installation

```bash
git clone git@github.com:maxxie114/openrouter-cli.git
cd openrouter-cli
npm install
npm run build
npm link
```

## Configuration

Store your management key in `~/.openrouter-cli`:

```bash
echo 'OPENROUTER_MANAGEMENT_KEY=sk-or-v1-...' > ~/.openrouter-cli
chmod 600 ~/.openrouter-cli
```

## Usage

```bash
openrouter-cli <command> [options]
```

### Commands

#### `list`
List all API keys.

```bash
openrouter-cli list
openrouter-cli list --all        # include disabled keys
```

#### `create <name>`
Create a new API key. The secret is shown only once — save it immediately.

```bash
openrouter-cli create my-app
openrouter-cli create my-app --limit 10              # $10 spending cap
openrouter-cli create my-app --limit 10 --reset monthly
openrouter-cli create my-app --expires 2026-12-31
```

| Option | Description |
|--------|-------------|
| `-l, --limit <usd>` | Spending limit in USD |
| `-r, --reset <period>` | Reset period: `daily`, `weekly`, or `monthly` |
| `-e, --expires <date>` | Expiry date in ISO 8601 format |

#### `get <name\|hash>`
Show details for a key.

```bash
openrouter-cli get my-app
openrouter-cli get abc123...
```

#### `update <name\|hash>`
Update a key's name, spending limit, or status.

```bash
openrouter-cli update my-app --name new-name
openrouter-cli update my-app --limit 25 --reset weekly
openrouter-cli update my-app --no-limit              # remove spending cap
openrouter-cli update my-app --disable
openrouter-cli update my-app --enable
```

| Option | Description |
|--------|-------------|
| `-n, --name <name>` | New name |
| `-l, --limit <usd>` | New spending limit in USD |
| `--no-limit` | Remove spending limit |
| `-r, --reset <period>` | New reset period |
| `--disable` | Disable the key |
| `--enable` | Re-enable the key |

#### `delete <name\|hash>`
Permanently delete a key. Prompts for confirmation unless `--force` is passed.

```bash
openrouter-cli delete my-app
openrouter-cli delete my-app --force
```

## Development

```bash
npm run build          # compile TypeScript
npm test               # unit tests
npm run test:integration  # integration tests (hits real API)
npm run cli -- list    # run without building
```
