import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateEventContentManifest } from "../scripts/generate-event-content-manifest.mjs";
import { createPathGuard } from "./pathGuard.mjs";
import { hashJson } from "./hash.mjs";
import { formatJson } from "./jsonFormat.mjs";
import { validateContentRoot } from "./validationGate.mjs";

const EVENT_ROOT = "content/events";
const GENERATED_ROOT = "apps/pc-client/src/content/generated";
const MANIFEST_PATH = "content/events/manifest.json";
const GENERATED_MANIFEST_PATH = "apps/pc-client/src/content/generated/eventContentManifest.ts";
const DOMAIN_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

export async function createEventDomain({
  repoRoot = path.resolve(import.meta.dirname, "../../.."),
  sourceRoot = repoRoot,
  body,
} = {}) {
  const request = normalizeCreateDomainRequest(body);
  const guard = createPathGuard(repoRoot, [EVENT_ROOT, GENERATED_ROOT]);
  const manifest = await readJson(guard, MANIFEST_PATH);
  const manifestBaseHash = hashJson(manifest);

  if (manifestBaseHash !== request.manifest_base_hash) {
    return manifestConflictResponse(manifestBaseHash);
  }
  if (!Array.isArray(manifest.domains)) {
    return validationFailedResponse({
      passed: false,
      command: "npm run validate:content",
      issues: [
        {
          severity: "error",
          code: "manifest_validation_failed",
          message: "Event manifest domains must be an array.",
          file_path: MANIFEST_PATH,
          asset_type: "manifest",
          json_path: "/domains",
        },
      ],
    });
  }
  if (manifest.domains.some((domain) => domain?.id === request.domain_id)) {
    return {
      statusCode: 409,
      body: {
        error: {
          code: "domain_exists",
          message: `Event domain already exists: ${request.domain_id}.`,
        },
        domain_id: request.domain_id,
      },
    };
  }

  const paths = domainPaths(request.domain_id);
  await assertDomainFilesDoNotExist(repoRoot, paths);

  const scaffold = buildDomainScaffold(request);
  const nextManifest = {
    ...manifest,
    domains: [
      ...manifest.domains,
      {
        id: request.domain_id,
        definitions: `definitions/${request.domain_id}.json`,
        call_templates: `call_templates/${request.domain_id}.json`,
        presets: null,
      },
    ],
  };
  const validationResult = await validateDomainCreationInTempRoot({
    repoRoot,
    sourceRoot,
    paths,
    scaffold,
    manifest: nextManifest,
  });

  if (!validationResult.validation.passed) {
    return validationFailedResponse(validationResult.validation);
  }

  const latestManifest = await readJson(guard, MANIFEST_PATH);
  const latestManifestHash = hashJson(latestManifest);
  if (latestManifestHash !== manifestBaseHash) {
    return manifestConflictResponse(latestManifestHash);
  }
  await assertDomainFilesDoNotExist(repoRoot, paths);

  await fs.mkdir(path.dirname(guard.resolveAllowedPath(paths.definitions)), { recursive: true });
  await fs.mkdir(path.dirname(guard.resolveAllowedPath(paths.callTemplates)), { recursive: true });
  await fs.mkdir(path.dirname(guard.resolveAllowedPath(GENERATED_MANIFEST_PATH)), { recursive: true });
  await fs.writeFile(guard.resolveAllowedPath(paths.definitions), formatJson(scaffold.definitions));
  await fs.writeFile(guard.resolveAllowedPath(paths.callTemplates), formatJson(scaffold.callTemplates));
  await fs.writeFile(guard.resolveAllowedPath(MANIFEST_PATH), formatJson(nextManifest));
  await fs.writeFile(guard.resolveAllowedPath(GENERATED_MANIFEST_PATH), validationResult.generated);

  return {
    statusCode: 200,
    body: {
      status: "created",
      domain_id: request.domain_id,
      manifest_base_hash: hashJson(nextManifest),
      files: {
        definitions: paths.definitions,
        call_templates: paths.callTemplates,
        manifest: MANIFEST_PATH,
        generated: GENERATED_MANIFEST_PATH,
      },
      validation: validationResult.validation,
    },
  };
}

function normalizeCreateDomainRequest(body) {
  const request = body && typeof body === "object" ? body : {};
  const domainId = request.domain_id ?? request.domainId ?? request.id;

  if (typeof domainId !== "string" || domainId.length === 0) {
    throw helperError(400, "invalid_domain_id", "domain_id must be a non-empty string.");
  }
  if (!DOMAIN_ID_PATTERN.test(domainId)) {
    throw helperError(
      400,
      "invalid_domain_id",
      "domain_id must start with a lowercase letter and contain only lowercase letters, numbers, and underscores.",
    );
  }
  if (typeof request.manifest_base_hash !== "string" || !/^[a-f0-9]{64}$/.test(request.manifest_base_hash)) {
    throw helperError(400, "invalid_base_hash", "manifest_base_hash must be a sha256 hash.");
  }

  return {
    domain_id: domainId,
    manifest_base_hash: request.manifest_base_hash,
    event_definition: request.scaffold?.event_definition ?? request.event_definition ?? request.definition,
    call_template: request.scaffold?.call_template ?? request.call_template,
  };
}

function buildDomainScaffold(request) {
  const defaultScaffold = buildDefaultScaffold(request.domain_id);
  const eventDefinition = request.event_definition ?? defaultScaffold.eventDefinition;
  const callTemplate = request.call_template ?? defaultScaffold.callTemplate;

  return {
    definitions: {
      event_definitions: [eventDefinition],
    },
    callTemplates: {
      call_templates: [callTemplate],
    },
  };
}

function buildDefaultScaffold(domainId) {
  const eventDefinitionId = `${domainId}.draft_event`;
  const callNodeId = "draft_call";
  const endNodeId = "draft_resolved";
  const callTemplateId = `${eventDefinitionId}.call.${callNodeId}`;
  const logTemplateId = "draft_resolution_log";

  return {
    eventDefinition: {
      schema_version: "event-program-model-v1",
      id: eventDefinitionId,
      version: 1,
      domain: domainId,
      title: `${domainId} draft event`,
      summary: "Draft event scaffold created by the Event Editor.",
      tags: ["draft", domainId],
      status: "draft",
      trigger: {
        type: "call_choice",
        required_context: ["crew_id", "call_id"],
      },
      candidate_selection: {
        priority: 0,
        weight: 0,
        mutex_group: null,
        max_instances_per_trigger: 1,
        requires_blocking_slot: false,
      },
      repeat_policy: {
        scope: "event",
        max_trigger_count: 1,
        cooldown_seconds: 0,
        history_key_template: `event:${eventDefinitionId}:{event_id}`,
        allow_while_active: false,
      },
      event_graph: {
        entry_node_id: callNodeId,
        nodes: [
          {
            id: callNodeId,
            type: "call",
            title: "Draft call",
            call_template_id: callTemplateId,
            speaker_crew_ref: {
              type: "primary_crew",
            },
            urgency: "normal",
            delivery: "queued_message",
            options: [
              {
                id: "acknowledge",
                is_default: true,
              },
            ],
            option_node_mapping: {
              acknowledge: endNodeId,
            },
            blocking: {
              occupies_crew_action: false,
              occupies_communication: true,
              blocking_key_template: null,
            },
            expires_in_seconds: null,
          },
          {
            id: endNodeId,
            type: "end",
            title: "Draft resolved",
            resolution: "resolved",
            result_key: "acknowledged",
            event_log_template_id: logTemplateId,
            history_writes: [],
            blocking: {
              occupies_crew_action: false,
              occupies_communication: false,
              blocking_key_template: null,
            },
            cleanup_policy: {
              release_blocking_claims: true,
              delete_active_calls: true,
              keep_player_summary: true,
            },
          },
        ],
        edges: [],
        terminal_node_ids: [endNodeId],
        graph_rules: {
          acyclic: true,
          max_active_nodes: 1,
          allow_parallel_nodes: false,
        },
      },
      log_templates: [
        {
          id: logTemplateId,
          summary: "Draft event acknowledged.",
          importance: "minor",
          visibility: "hidden_until_resolved",
        },
      ],
      content_refs: {
        call_template_ids: [callTemplateId],
      },
      sample_contexts: [
        {
          trigger_type: "call_choice",
          occurred_at: 0,
          source: "call",
          crew_id: null,
          call_id: "draft_call",
        },
      ],
    },
    callTemplate: {
      schema_version: "event-program-model-v1",
      id: callTemplateId,
      version: 1,
      domain: domainId,
      event_definition_id: eventDefinitionId,
      node_id: callNodeId,
      render_context_fields: ["crew_id", "crew_display_name", "event_pressure"],
      opening_lines: {
        selection: "best_match",
        variants: [
          {
            id: "draft_opening_default",
            text: "{{crew_display_name}} reports a draft event that still needs authored content.",
            priority: 0,
          },
        ],
      },
      option_lines: {
        acknowledge: {
          selection: "best_match",
          variants: [
            {
              id: "draft_acknowledge_default",
              text: "Acknowledge the draft report.",
              priority: 0,
            },
          ],
        },
      },
      fallback_order: ["crew_id", "event_pressure", "default"],
      default_variant_required: true,
    },
  };
}

async function validateDomainCreationInTempRoot({ repoRoot, sourceRoot, paths, scaffold, manifest }) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-event-domain-"));
  try {
    await fs.cp(path.join(repoRoot, "content"), path.join(tempRoot, "content"), { recursive: true });
    await fs.mkdir(path.dirname(path.join(tempRoot, paths.definitions)), { recursive: true });
    await fs.mkdir(path.dirname(path.join(tempRoot, paths.callTemplates)), { recursive: true });
    await fs.writeFile(path.join(tempRoot, paths.definitions), formatJson(scaffold.definitions));
    await fs.writeFile(path.join(tempRoot, paths.callTemplates), formatJson(scaffold.callTemplates));
    await fs.writeFile(path.join(tempRoot, MANIFEST_PATH), formatJson(manifest));

    let generated;
    try {
      generated = generateEventContentManifest(tempRoot, path.join(tempRoot, GENERATED_MANIFEST_PATH));
    } catch (error) {
      return {
        generated: "",
        validation: {
          passed: false,
          command: "npm run validate:content",
          issues: [
            {
              severity: "error",
              code: "manifest_validation_failed",
              message: error instanceof Error ? error.message : String(error),
              file_path: MANIFEST_PATH,
              asset_type: "manifest",
              json_path: "/",
            },
          ],
        },
      };
    }

    return {
      generated,
      validation: await validateContentRoot({
        contentRoot: tempRoot,
        sourceRoot,
        target: {
          file_path: paths.definitions,
          asset_type: "event_definition",
          asset_id: scaffold.definitions.event_definitions[0]?.id,
          json_path: "/event_definitions/0",
        },
      }),
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function readJson(guard, relativePath) {
  const absolutePath = guard.resolveAllowedPath(relativePath);
  return JSON.parse(await fs.readFile(absolutePath, "utf8"));
}

async function assertDomainFilesDoNotExist(repoRoot, paths) {
  for (const filePath of [paths.definitions, paths.callTemplates]) {
    try {
      await fs.access(path.join(repoRoot, filePath));
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }
      throw error;
    }

    throw helperError(409, "domain_file_exists", `Event domain file already exists: ${filePath}.`);
  }
}

function domainPaths(domainId) {
  return {
    definitions: `content/events/definitions/${domainId}.json`,
    callTemplates: `content/events/call_templates/${domainId}.json`,
  };
}

function validationFailedResponse(validation) {
  return {
    statusCode: 422,
    body: {
      error: {
        code: "validation_failed",
        message: "New domain scaffold did not pass content validation.",
      },
      validation,
    },
  };
}

function manifestConflictResponse(currentBaseHash) {
  return {
    statusCode: 409,
    body: {
      error: {
        code: "conflict",
        message: "The event manifest changed after this request was prepared.",
      },
      current_manifest_base_hash: currentBaseHash,
    },
  };
}

function helperError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
