# Project environment

Save environment variables in Paseo and let your agents use them in commands and API requests. Add an API key once, describe what it is for, and ask an agent to use it without editing `.env` files or pasting the key into chat.

The plugin adds a **Project environment** panel and two agent tools. Agents can discover the names and descriptions of available variables, then run commands with the variables they need. Each command reads the latest saved values, so you can change a key without reopening the agent.

## Install

Requires Paseo `>=0.13.2 <0.14.0` and a macOS or Linux daemon.

Enable plugins under **Settings → Plugins** on the host where your agents run, then install:

```sh
paseo plugin install git:https://github.com/508-dev/paseo-project-environment.git
```

You can also paste that Git source into **Settings → Plugins → Plugin source** in Paseo. The plugin and its variables live on the selected host.

## Add your first variable

1. Open a workspace in Paseo.
2. Open the Command Center with **⌘K** on macOS or **Ctrl+K** on Windows/Linux, then choose **Project environment**.
3. Under **Add or replace a variable**, enter its name, description, and value. For example:
   - **Name:** `STRIPE_API_KEY`
   - **Description:** `Stripe test-mode key for reading customers`
   - **Value:** Paste your key into the masked value field.
4. Select **Save**. The panel lists the saved name and description; it does not show the value again.

Variables belong to the project. Git worktrees of the same repository share them; separate non-Git directories have separate variables.

## Ask an agent to use it

For the first try, create a new agent in that workspace after installing the plugin. New agents receive the tools and usage instructions automatically. Agents created before installation need one-time MCP configuration before they can discover these tools.

Try a check that does not make an API request:

> List the project environment variables. Use the environment command tool to check that STRIPE_API_KEY is set, without printing its value.

Then ask for an API operation:

> Use STRIPE_API_KEY from the project environment to fetch five Stripe customers. Run the request through the environment command tool, read the key from the environment, and show me the customer summaries. Do not print the key or write it into a file.

The agent submits code that references the variable by name, such as `os.environ["STRIPE_API_KEY"]` in Python or `$STRIPE_API_KEY` in a shell command. The plugin injects the actual value when that command runs. The API receives the credential; the agent receives the command's output with exact saved values redacted.

The two tools are:

| Tool                       | What it does                                                                 |
| -------------------------- | ---------------------------------------------------------------------------- |
| `project_environment_list` | Lists available variable names and descriptions without returning values.    |
| `project_environment_run`  | Runs a shell command in the workspace with the requested variables injected. |

Use the environment command tool for commands that need saved variables. The agent's ordinary shell tool, existing terminals, and running development servers do not automatically receive them.

## Change or remove a variable

Open **Project environment**, find the saved variable, and choose **Replace** to enter a new value. You can also save a variable with the same name to replace it. To delete one, choose **Remove** and confirm.

The next environment command uses the updated set of variables. You do not need to reopen the agent or reconnect its tools. Commands already running keep the values they started with. Ask the agent to list variables again if you have added or removed names.

## Storage and access

Save values through the panel rather than chat. Variables are stored outside the project in owner-only plaintext files on the daemon host. Commands run with that host user's filesystem and network access and can perform whatever API operations a key permits. Redaction reduces accidental disclosure but cannot prevent a command from writing or transmitting a credential.

See [OVERVIEW.md](OVERVIEW.md) for the storage path, execution limits, output handling, and access boundaries.

## Development

```sh
git clone https://github.com/508-dev/paseo-project-environment.git
cd paseo-project-environment
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm test
paseo plugin install "$PWD"
```

The behavior tests include an API request with an injected key, replacing that key through the same MCP connection, and continuing to use the connection after a broker restart. Dependencies use a committed lockfile. The local npm configuration enables legacy peer resolution because npm 10 crashes when resolving the SDK's optional peer graph.

Registry publication requires interface screenshots and a separate registry submission. This repository currently supports installation from Git.
