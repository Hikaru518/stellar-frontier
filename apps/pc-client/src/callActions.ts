import {
  callActionsContent,
  defaultMapConfig,
  type CallActionDef,
  type MapObjectDefinition,
  type Tone,
} from "./content/contentData";
import type { CrewMember, GameState, MapTile } from "./data/gameData";
import type { RuntimeCall } from "./events/types";

export type { CallActionDef } from "./content/contentData";

export interface CallActionGroup {
  title: string;
  actions: CallActionView[];
}

export interface CallActionView {
  id: string;
  defId: string;
  label: string;
  tone: Tone;
  objectId?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface BuildCallViewArgs {
  member: CrewMember;
  tile: MapTile;
  gameState: GameState;
}

type TileWithObjects = MapTile & {
  discovered?: boolean;
  objects?: MapObjectDefinition[];
};

export function loadCallActions(): CallActionDef[] {
  return [...callActionsContent];
}

export function buildCallView({ member, tile, gameState }: BuildCallViewArgs): { groups: CallActionGroup[]; runtimeCall?: RuntimeCall } {
  const actions = loadCallActions();
  const runtimeCall = findRuntimeCallForMember(member, gameState);
  const universalActions = actions.filter((action) => action.category === "universal");
  const baseActions = member.activeAction ? universalActions.filter((action) => action.availableWhenBusy) : universalActions;
  const groups: CallActionGroup[] = [
    {
      title: "基础行动",
      actions: baseActions.map(createUniversalActionView),
    },
  ];

  if (!member.activeAction) {
    groups.push(...buildObjectActionGroups(tile, gameState, actions));
  }

  return runtimeCall ? { groups, runtimeCall } : { groups };
}

function createUniversalActionView(definition: CallActionDef): CallActionView {
  return {
    id: definition.id,
    defId: definition.id,
    label: definition.label,
    tone: definition.tone,
  };
}

function buildObjectActionGroups(tile: MapTile, gameState: GameState, actions: CallActionDef[]): CallActionGroup[] {
  const definitionsById = new Map(
    actions.filter((action) => action.category === "object_action").map((action) => [action.id, action]),
  );
  const tileObjects = getTileObjects(tile);

  return tileObjects.flatMap((object) => {
    if (!isObjectRevealed(tile, object, gameState)) {
      return [];
    }

    const objectActions = (object.candidateActions ?? []).flatMap((candidateAction) => {
      const definition = definitionsById.get(candidateAction);

      if (!definition || !isActionApplicableToObject(definition, object)) {
        return [];
      }

      return [createObjectActionView(definition, object)];
    });

    return objectActions.length > 0 ? [{ title: object.name, actions: objectActions }] : [];
  });
}

function createObjectActionView(definition: CallActionDef, object: MapObjectDefinition): CallActionView {
  return {
    id: `${definition.id}:${object.id}`,
    defId: definition.id,
    label: definition.label.split("{objectName}").join(object.name),
    tone: definition.tone,
    objectId: object.id,
  };
}

function isObjectRevealed(tile: MapTile, object: MapObjectDefinition, gameState: GameState) {
  const tileWithObjects = tile as TileWithObjects;
  const runtimeTile = gameState.map.tilesById[tile.id];
  const revealedObjectIds = new Set(runtimeTile?.revealedObjectIds ?? []);
  const isDiscovered = Boolean(tileWithObjects.discovered || runtimeTile?.discovered || gameState.map.discoveredTileIds.includes(tile.id));
  const isInvestigated = Boolean(tile.investigated || runtimeTile?.investigated);

  return (
    hasExplicitRevealFlag(object) ||
    revealedObjectIds.has(object.id) ||
    (object.visibility === "onDiscovered" && isDiscovered) ||
    (object.visibility === "onInvestigated" && isInvestigated)
  );
}

function hasExplicitRevealFlag(object: MapObjectDefinition) {
  return "revealed" in object && object.revealed === true;
}

function isActionApplicableToObject(definition: CallActionDef, object: MapObjectDefinition) {
  return !definition.applicableObjectKinds || definition.applicableObjectKinds.includes(object.kind);
}

function getTileObjects(tile: MapTile): MapObjectDefinition[] {
  const tileWithObjects = tile as TileWithObjects;
  if (tileWithObjects.objects) {
    return tileWithObjects.objects;
  }

  return defaultMapConfig.tiles.find((configTile) => configTile.id === tile.id)?.objects ?? [];
}

function findRuntimeCallForMember(member: CrewMember, gameState: GameState) {
  return Object.values(gameState.active_calls).find((call) => call.crew_id === member.id);
}
