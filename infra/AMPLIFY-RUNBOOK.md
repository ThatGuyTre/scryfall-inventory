# Amplify deployment runbook

How this app gets its configuration on AWS Amplify Hosting, and what to do when
it does not. The failure this exists to prevent: the sign-in page reports that no
sign-in method is configured while the Amplify console shows every value plainly
present.

## Why that happens

Two independent mechanisms, neither of them a mistake in how the values were
entered.

**Secret management does not create environment variables.** Amplify secrets are
AWS Systems Manager Parameter Store parameters. They never appear in
`process.env` under their own names, so no spelling of `COGNITO_CLIENT_ID` will
find them.

**Environment variables do not reach a Next.js server either.** AWS withholds the
build environment from the SSR compute function deliberately, so that build-time
secrets are not handed to it. A variable set correctly in the console is still
unreadable at runtime unless the build writes it somewhere Next.js loads.

`amplify.yml` handles the second problem for non-sensitive settings, by writing
the names it lists into `.env.production` before `next build`. Secrets
deliberately do not use that route: `.env.production` is part of the deployment
artifact, so anything written into it is readable by anyone who can read the
deployment. `src/lib/config/secretStore.ts` reads those from Parameter Store at
runtime instead, and `resolveConfig()` merges the two sources with the
environment winning where both hold a name.

## What goes where

| Setting | Where it belongs |
| ------- | ---------------- |
| `COGNITO_CLIENT_ID` | Secret management, **All branches** |
| `COGNITO_CLIENT_SECRET` | Secret management, **All branches** |
| `COGNITO_ISSUER` | Secret management, **All branches** |
| `NEXTAUTH_SECRET` | Secret management, **All branches** |
| `DIAGNOSTICS_TOKEN` | Secret management, when you want the diagnostics route |
| `NEXTAUTH_URL` | Environment variables — not a secret, and needed at build |
| `INVENTORY_DRIVER`, `INVENTORY_TABLE` | Either; neither is sensitive |

Secrets must be scoped to **All branches**. Those live at
`/amplify/shared/<app id>/<name>`, a path a running app can construct.
Branch-scoped secrets get an Amplify-generated hash in their path that the
runtime cannot derive, so they will not be found.

`NEXTAUTH_URL` must be the origin the browser actually uses. A branch-level value
overrides the all-branches one, so a branch on a custom domain needs that domain
rather than its `amplifyapp.com` address. A trailing slash is fine — next-auth
normalizes it.

Do not set `NODE_ENV`. Amplify and Next set it themselves for both build and
runtime, so the row is redundant, and it also makes `npm ci` skip
devDependencies — a surprise waiting for the first build that needs one.

Adding a non-secret setting in the console is not enough on its own: it has to be
named in `amplify.yml` too. Secrets need no change there, since they are read by
path rather than by name.

## The compute role

Reading Parameter Store at runtime needs credentials, which come from an **SSR
compute role**. This is not the app's service role, and the distinction is the
whole trap:

- `--iam-service-role-arn` is the build role. It grants the running app nothing.
- `--compute-role-arn` is assumed by the SSR compute function itself.

`stack.yaml` creates both, and the `AttachAmplifyRolesCommand` output attaches
both. Attaching only the first leaves a fully configured app insisting Cognito is
absent.

The compute role is scoped to reading and decrypting exactly this app's shared
secret path, plus the three DynamoDB calls the inventory driver makes against
this one table. That narrowness matters: its credentials are live inside the SSR
runtime, so any code-execution bug in the app inherits whatever the role can do.

Running the inventory on DynamoDB needs `INVENTORY_DRIVER=dynamodb` and
`INVENTORY_TABLE` as well. Without the compute role attached, the driver has no
credentials and every read fails.

## Deploying

Run from the repository root, on the branch carrying the change.

```bash
npm run infra:changeset -- --domain-prefix mtg-inventory --amplify-app-id <app id> --url https://<your domain> --region <region>
```

That builds a change set and applies nothing. Read it, then:

```bash
aws cloudformation execute-change-set --change-set-name <arn printed above>
```

Then read the outputs and run `AttachAmplifyRolesCommand`:

```bash
aws cloudformation describe-stacks --stack-name mtg-inventory-tool --query "Stacks[0].Outputs"
```

Finally check the Cognito app client actually allows the deployed origin. If the
stack was first created without `--url`, only localhost is registered and Cognito
will refuse the redirect:

```bash
aws cognito-idp describe-user-pool-client --user-pool-id <pool id> --client-id <client id> --query "UserPoolClient.{Callbacks:CallbackURLs,Logouts:LogoutURLs}"
```

You need `https://<your domain>/api/auth/callback/cognito`. `--url` takes one
value, so a second origin has to be added by hand.

Redeploy the branch afterwards. A role change alone needs no redeploy, but a
change to `amplify.yml` does.

### Do not delete the stack to update it

`InventoryTable` and `UserPool` are both `DeletionPolicy: Retain`, so deleting
the stack leaves them behind, orphaned. The table name is fixed, so recreating it
fails with "table already exists". The user pool is worse: the new stack creates
a fresh one, meaning a new pool id, issuer, client id and client secret, with any
existing accounts stranded in the abandoned pool.

Ordinary updates are in-place and touch neither. If you genuinely must recreate,
lift deletion protection and delete the retained table first, then expect to
replace all three Cognito secrets.

## Checking what a deployment can see

Set `DIAGNOSTICS_TOKEN` and `/api/diagnostics/config` reports what the running
process holds. It never returns a value — only whether each setting is present,
its length, whether it carries stray whitespace, which source supplied it, and
the conclusions the app draws.

```bash
curl -H "x-diagnostics-token: $DIAGNOSTICS_TOKEN" https://<your domain>/api/diagnostics/config
```

A working deployment reports `secretStore.readable` true, a `secretStore.path` of
`/amplify/shared/<app id>/`, `"source": "parameter-store"` on each Cognito
setting, and `cognito` in `conclusions.providers`.

If Parameter Store cannot be read, the warning names the likely cause rather than
leaving you to guess — usually a missing compute role. The route answers 404
unless the token is set and matches, so there is nothing to find on a deployment
that never enabled it.

## The filesystem is read only

Sign-in creates a profile row every time, and the JSON driver writes to
`src/data/accounts.json`. Amplify's SSR compute is a Lambda, whose filesystem is
read only outside `/tmp`, so that write throws and sign-in fails *after* Cognito
has authenticated — which looks like a Cognito problem and is not.

The inventory side is solved: set `INVENTORY_DRIVER=dynamodb` and
`INVENTORY_TABLE` and nothing touches the filesystem. Accounts still do. Until
the account store gets the same treatment, point `ACCOUNTS_FILE` at `/tmp` to
prove sign-in end to end, knowing that file is per-container and vanishes on a
cold start.
