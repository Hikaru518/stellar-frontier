import type { CallTemplate, EventDefinition, HandlerDefinition, Id, PresetDefinition, TriggerType } from "./types";

export interface EventContentLibrary {
  domains: readonly string[];
  event_definitions: EventDefinition[];
  call_templates: CallTemplate[];
  handlers: HandlerDefinition[];
  presets: PresetDefinition[];
}

export type EventContentIndexErrorCode =
  | "duplicate_event_definition_id"
  | "duplicate_call_template_id"
  | "duplicate_handler_type";

export interface EventContentIndexError {
  code: EventContentIndexErrorCode;
  path: string;
  message: string;
}

export interface EventContentIndexResult {
  index: EventContentIndex;
  errors: EventContentIndexError[];
}

export class EventContentIndex {
  readonly definitionsById = new Map<Id, EventDefinition>();
  readonly callTemplatesById = new Map<Id, CallTemplate>();
  readonly handlersByType = new Map<string, HandlerDefinition>();
  readonly presetsById = new Map<Id, PresetDefinition>();
  readonly definitionsByTriggerType = new Map<TriggerType, EventDefinition[]>();
  readonly definitionsByDomain = new Map<string, EventDefinition[]>();
  readonly definitionsByTag = new Map<string, EventDefinition[]>();
  readonly definitionsByMutexGroup = new Map<string, EventDefinition[]>();

  addDefinition(definition: EventDefinition): void {
    this.definitionsById.set(definition.id, definition);
    appendToIndex(this.definitionsByTriggerType, definition.trigger.type, definition);
    appendToIndex(this.definitionsByDomain, definition.domain, definition);

    for (const tag of definition.tags ?? []) {
      appendToIndex(this.definitionsByTag, tag, definition);
    }

    if (definition.candidate_selection.mutex_group) {
      appendToIndex(this.definitionsByMutexGroup, definition.candidate_selection.mutex_group, definition);
    }
  }

  addCallTemplate(template: CallTemplate): void {
    this.callTemplatesById.set(template.id, template);
  }

  addHandler(handler: HandlerDefinition): void {
    this.handlersByType.set(handler.handler_type, handler);
  }

  addPreset(preset: PresetDefinition): void {
    this.presetsById.set(preset.id, preset);
  }

  getDefinitionsByTriggerType(triggerType: TriggerType): EventDefinition[] {
    return this.definitionsByTriggerType.get(triggerType) ?? [];
  }

  getDefinitionsByDomain(domain: string): EventDefinition[] {
    return this.definitionsByDomain.get(domain) ?? [];
  }

  getDefinitionsByTag(tag: string): EventDefinition[] {
    return this.definitionsByTag.get(tag) ?? [];
  }

  getDefinitionsByMutexGroup(mutexGroup: string): EventDefinition[] {
    return this.definitionsByMutexGroup.get(mutexGroup) ?? [];
  }
}

export function buildEventContentIndex(library: EventContentLibrary): EventContentIndexResult {
  const index = new EventContentIndex();
  const errors: EventContentIndexError[] = [];

  library.event_definitions.forEach((definition, definitionIndex) => {
    if (index.definitionsById.has(definition.id)) {
      errors.push({
        code: "duplicate_event_definition_id",
        path: `event_definitions[${definitionIndex}].id`,
        message: `Duplicate event_definition id: ${definition.id}`,
      });
      return;
    }

    index.addDefinition(definition);
  });

  library.call_templates.forEach((template, templateIndex) => {
    if (index.callTemplatesById.has(template.id)) {
      errors.push({
        code: "duplicate_call_template_id",
        path: `call_templates[${templateIndex}].id`,
        message: `Duplicate call_template id: ${template.id}`,
      });
      return;
    }

    index.addCallTemplate(template);
  });

  library.handlers.forEach((handler, handlerIndex) => {
    if (index.handlersByType.has(handler.handler_type)) {
      errors.push({
        code: "duplicate_handler_type",
        path: `handlers[${handlerIndex}].handler_type`,
        message: `Duplicate handler_type: ${handler.handler_type}`,
      });
      return;
    }

    index.addHandler(handler);
  });

  for (const preset of library.presets) {
    index.addPreset(preset);
  }

  return { index, errors };
}

function appendToIndex<Key, Value>(index: Map<Key, Value[]>, key: Key, value: Value): void {
  const existing = index.get(key);

  if (existing) {
    existing.push(value);
    return;
  }

  index.set(key, [value]);
}
