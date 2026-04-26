import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const pairs = [
  ["content/events/events.json", "content/schemas/events.schema.json"],
  ["content/crew/crew.json", "content/schemas/crew.schema.json"],
  ["content/items/items.json", "content/schemas/items.schema.json"],
];

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
const loaded = Object.fromEntries(pairs.map(([dataPath]) => [dataPath, readJson(dataPath)]));
const validItemTags = new Set(["food", "light", "medical", "signal", "clue"]);
const validAddItemTargets = new Set(["crewInventory", "baseInventory"]);

let failed = false;

for (const [dataPath, schemaPath] of pairs) {
  const schema = readJson(schemaPath);
  const validate = ajv.compile(schema);
  const valid = validate(loaded[dataPath]);

  if (!valid) {
    failed = true;
    console.error(`Schema validation failed: ${dataPath}`);
    for (const error of validate.errors ?? []) {
      console.error(`  ${error.instancePath || "/"} ${error.message}`);
    }
  }
}

failed = validateReferences(loaded) || failed;

if (failed) {
  process.exitCode = 1;
} else {
  console.log("Content validation passed.");
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function validateReferences(data) {
  let hasError = false;
  const events = data["content/events/events.json"].events;
  const crew = data["content/crew/crew.json"].crew;
  const items = data["content/items/items.json"].items;

  const eventIds = new Set();
  const itemIds = new Set();
  const crewIds = new Set();

  for (const item of items) {
    if (!addUnique(itemIds, item.itemId)) {
      hasError = report(`Duplicate itemId: ${item.itemId}`);
    }
  }

  for (const member of crew) {
    if (!addUnique(crewIds, member.crewId)) {
      hasError = report(`Duplicate crewId: ${member.crewId}`);
    }

    for (const entry of member.inventory) {
      if (!itemIds.has(entry.itemId)) {
        hasError = report(`Unknown itemId in crew ${member.crewId}: ${entry.itemId}`);
      }
    }
  }

  for (const event of events) {
    if (!addUnique(eventIds, event.eventId)) {
      hasError = report(`Duplicate eventId: ${event.eventId}`);
    }

    const choiceIds = new Set(event.choices.map((choice) => choice.choiceId));
    if (event.emergency && !choiceIds.has(event.emergency.autoResolveResult)) {
      hasError = report(`Unknown autoResolveResult in event ${event.eventId}: ${event.emergency.autoResolveResult}`);
    }

    for (const effect of event.effects) {
      hasError = validateEffectReference(event.eventId, effect, itemIds) || hasError;
    }

    for (const choice of event.choices) {
      const owner = `${event.eventId}.${choice.choiceId}`;
      if (choice.usesItemTag && !validItemTags.has(choice.usesItemTag)) {
        hasError = report(`Invalid usesItemTag in ${owner}: ${choice.usesItemTag}`) || hasError;
      }

      const choiceEffects = [
        ...(choice.effects ?? []),
        ...(choice.successEffects ?? []),
        ...(choice.failureEffects ?? []),
      ];
      if (choice.usesItemTag && !choiceEffects.some((effect) => effect.type === "useItemByTag" && effect.itemTag === choice.usesItemTag)) {
        hasError = report(`Choice ${owner} usesItemTag '${choice.usesItemTag}' but has no matching useItemByTag effect`) || hasError;
      }

      for (const effect of choice.effects ?? []) {
        hasError = validateEffectReference(owner, effect, itemIds) || hasError;
      }
      for (const effect of choice.successEffects ?? []) {
        hasError = validateEffectReference(`${owner}.success`, effect, itemIds) || hasError;
      }
      for (const effect of choice.failureEffects ?? []) {
        hasError = validateEffectReference(`${owner}.failure`, effect, itemIds) || hasError;
      }
    }
  }

  for (const member of crew) {
    if (member.emergencyEvent && !eventIds.has(member.emergencyEvent.eventId)) {
      hasError = report(`Unknown emergency eventId in crew ${member.crewId}: ${member.emergencyEvent.eventId}`);
    }
  }

  return hasError;
}

function validateEffectReference(owner, effect, itemIds) {
  if ((effect.type === "addResource" || effect.type === "removeResource" || effect.type === "discoverResource") && !itemIds.has(effect.resource)) {
    return report(`Unknown resource item in ${owner}: ${effect.resource}`);
  }

  if (effect.type === "addItem") {
    let hasError = false;
    if (!itemIds.has(effect.itemId)) {
      hasError = report(`Unknown addItem.itemId in ${owner}: ${effect.itemId}`) || hasError;
    }
    if (!validAddItemTargets.has(effect.target)) {
      hasError = report(`Invalid addItem.target in ${owner}: ${effect.target}`) || hasError;
    }
    return hasError;
  }

  if (effect.type === "useItemByTag" && !validItemTags.has(effect.itemTag)) {
    return report(`Invalid useItemByTag.itemTag in ${owner}: ${effect.itemTag}`);
  }

  return false;
}

function addUnique(set, value) {
  if (set.has(value)) {
    return false;
  }

  set.add(value);
  return true;
}

function report(message) {
  console.error(message);
  return true;
}
