# Azure Container Apps deployment

**Live:** https://youtube-intelligence-agent.agreeablecliff-6b95fa55.eastus.azurecontainerapps.io

| Resource | Value |
|---|---|
| Container App | `youtube-intelligence-agent` (resource group `rg-youtube-intel`, East US) |
| Environment | `cae-stock-dashboard` (shared, resource group `rg-stock-dashboard`) |
| Image | `smacr17fe68a9.azurecr.io/youtube-intelligence-agent:vN` (pulled with the app's system-assigned identity) |
| Database | PostgreSQL Flexible Server `iia-pg-591055` (East US 2, resource group `rg-instagram-intel`), database `youtube_intel` |
| Scale / size | 0–1 replicas (scales to zero), 0.5 vCPU / 1 GiB, ingress external on port 8080 |

**Secrets** (Container App secrets, referenced from env vars): `database-url`, `session-secret`, `youtube-key`, `openai-key`, `web-search-key`.

**Env vars:** `NODE_ENV=production`, `PORT=8080`, `YOUTUBE_API_MODE=youtube`, `LLM_PROVIDER=openai`, `OPENAI_MODEL=gpt-4o-mini`, `WEB_SEARCH_PROVIDER=serper`, `ALLOW_SIGNUP=false`, `OWNER_EMAIL=tanmoy1.sarkar@gmail.com`, `CORS_ORIGINS=<app URL>`.

On startup the container runs `prisma db push`, which applies schema changes. It only makes non-destructive changes and fails rather than drop data.

## Redeploy after code changes

Run these in Git Bash from the repo root:

```bash
export MSYS_NO_PATHCONV=1 PYTHONIOENCODING=utf-8 PYTHONUTF8=1
az acr build -r smacr17fe68a9 -t youtube-intelligence-agent:v2 -t youtube-intelligence-agent:latest .
az containerapp update -g rg-youtube-intel -n youtube-intelligence-agent --image smacr17fe68a9.azurecr.io/youtube-intelligence-agent:v2
```

On Windows, `az acr build` may crash while streaming logs with a `UnicodeEncodeError`. The build keeps running in Azure; check it with `az acr task list-runs -r smacr17fe68a9 --top 1 -o table`.

## Rotate a key

```bash
az containerapp secret set -g rg-youtube-intel -n youtube-intelligence-agent --secrets youtube-key=<NEW_KEY>
az containerapp revision restart -g rg-youtube-intel -n youtube-intelligence-agent --revision $(az containerapp show -g rg-youtube-intel -n youtube-intelligence-agent --query properties.latestRevisionName -o tsv)
```

## Logs

```bash
az containerapp logs show -g rg-youtube-intel -n youtube-intelligence-agent --tail 100
```
