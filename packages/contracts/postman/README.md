# Postman collection

`nutrixx-agent-curation.postman_collection.json` is the importable local
operator workflow for agent-curated reference data.

## Preparation

1. Set `NUTRIXX_CURATION_ENABLED=true` in the ignored root `.env` file.
2. Set `NUTRIXX_CURATION_TOKEN` to a unique high-entropy local token.
3. Recreate the API service so it receives the updated environment.
4. Import the collection into Postman.
5. Set the collection variable `curationToken` to the same token.

## Workflow

1. Run the standard prompt in
   `docs/data/agent-curation-prompt.md` with a task packet.
   Copy its companion SHA-256 value into the task packet.
2. Copy the complete bare JSON response into the collection variable
   `agentBatchJson`.
3. Send `1 - Submit Agent Curation Batch`.
4. Send `2 - Get Curation Run Status` until `status` is `completed` or
   `failed`. The submit request stores `runId` automatically.

The collection begins with an empty claims template and blocks submission until
an agent batch replaces it. A completed response identifies the generated
artifact, receipt, report, quarantine count, projected fallback count, and
values shadowed by external sources. Public release activation remains part of
the immutable delivery workflow.
