import {
  bucketFillVisualCells,
  eraseVisualCell,
  paintVisualCell,
  rectangleFillVisualCells,
} from "./visualLayerOps";
import type { MapEditorCommand, MapEditorDraft, MapEditorState, MapTileDefinition, SemanticBrush } from "./types";

export const MAP_EDITOR_HISTORY_LIMIT = 100;

export function mapEditorReducer(state: MapEditorState, command: MapEditorCommand): MapEditorState {
  switch (command.type) {
    case "visual/brush":
      return commitDraftChange(state, paintVisualCell(state.draft, state.activeLayerId, command.tileId, command.cell));
    case "visual/eraser":
      return commitDraftChange(state, eraseVisualCell(state.draft, state.activeLayerId, command.tileId));
    case "visual/bucketFill":
      return commitDraftChange(
        state,
        bucketFillVisualCells(state.draft, state.activeLayerId, command.tileId, command.cell),
      );
    case "visual/rectangleFill":
      return commitDraftChange(
        state,
        rectangleFillVisualCells(state.draft, state.activeLayerId, command.fromTileId, command.toTileId, command.cell),
      );
    case "layer/setActive":
      if (state.activeLayerId === command.layerId) {
        return state;
      }
      return {
        ...state,
        activeLayerId: command.layerId,
      };
    case "layer/add": {
      const nextState = commitDraftChange(state, {
        ...state.draft,
        visual: {
          ...state.draft.visual,
          layers: [...state.draft.visual.layers, command.layer],
        },
      });
      return {
        ...nextState,
        activeLayerId: command.layer.id,
      };
    }
    case "layer/rename":
      return commitLayerChange(state, command.layerId, (layer) => {
        const name = command.name.trim();
        return layer.name === name || name.length === 0 ? layer : { ...layer, name };
      });
    case "layer/move":
      return moveLayer(state, command.layerId, command.direction);
    case "layer/delete":
      return deleteLayer(state, command.layerId);
    case "layer/setVisible":
      return commitLayerChange(state, command.layerId, (layer) =>
        layer.visible === command.visible ? layer : { ...layer, visible: command.visible },
      );
    case "layer/setLocked":
      return commitLayerChange(state, command.layerId, (layer) =>
        layer.locked === command.locked ? layer : { ...layer, locked: command.locked },
      );
    case "layer/setOpacity":
      return commitLayerChange(state, command.layerId, (layer) => {
        const opacity = Math.max(0, Math.min(1, command.opacity));
        return layer.opacity === opacity ? layer : { ...layer, opacity };
      });
    case "gameplay/updateTile":
      return updateGameplayTile(state, command.tileId, command.patch);
    case "gameplay/setOrigin":
      return setOriginTile(state, command.tileId);
    case "gameplay/setDiscovered":
      return setDiscoveredTile(state, command.tileId, command.discovered);
    case "gameplay/applySemanticBrush":
      return applySemanticBrush(state, command.tileId, command.brush);
    case "history/undo":
      return undo(state);
    case "history/redo":
      return redo(state);
    default:
      return state;
  }
}

function updateGameplayTile(
  state: MapEditorState,
  tileId: string,
  patch: Partial<Pick<MapTileDefinition, "areaName" | "terrain" | "weather" | "environment" | "objectIds" | "specialStates">>,
): MapEditorState {
  const tileIndex = state.draft.tiles.findIndex((tile) => tile.id === tileId);
  if (tileIndex < 0) {
    return state;
  }

  const currentTile = state.draft.tiles[tileIndex];
  if (!currentTile) {
    return state;
  }

  const nextTile: MapTileDefinition = {
    ...currentTile,
    ...patch,
    areaName: patch.areaName === undefined ? currentTile.areaName : patch.areaName.trim(),
    environment: patch.environment ? { ...currentTile.environment, ...patch.environment } : currentTile.environment,
    objectIds: patch.objectIds ? Array.from(new Set(patch.objectIds)) : currentTile.objectIds,
    specialStates: patch.specialStates ? patch.specialStates.map((stateDefinition) => ({ ...stateDefinition })) : currentTile.specialStates,
  };

  if (nextTile.areaName.length === 0) {
    nextTile.areaName = currentTile.areaName;
  }

  if (areTilesEqual(currentTile, nextTile)) {
    return state;
  }

  return commitDraftChange(state, {
    ...state.draft,
    tiles: state.draft.tiles.map((tile, index) => (index === tileIndex ? nextTile : tile)),
  });
}

function setOriginTile(state: MapEditorState, tileId: string): MapEditorState {
  if (!state.draft.tiles.some((tile) => tile.id === tileId)) {
    return state;
  }

  const initialDiscoveredTileIds = state.draft.initialDiscoveredTileIds.includes(tileId)
    ? state.draft.initialDiscoveredTileIds
    : [...state.draft.initialDiscoveredTileIds, tileId];

  if (state.draft.originTileId === tileId && initialDiscoveredTileIds === state.draft.initialDiscoveredTileIds) {
    return state;
  }

  return commitDraftChange(state, {
    ...state.draft,
    originTileId: tileId,
    initialDiscoveredTileIds,
  });
}

function setDiscoveredTile(state: MapEditorState, tileId: string, discovered: boolean): MapEditorState {
  if (!state.draft.tiles.some((tile) => tile.id === tileId)) {
    return state;
  }

  const isDiscovered = state.draft.initialDiscoveredTileIds.includes(tileId);
  if (isDiscovered === discovered) {
    return state;
  }

  return commitDraftChange(state, {
    ...state.draft,
    initialDiscoveredTileIds: discovered
      ? [...state.draft.initialDiscoveredTileIds, tileId]
      : state.draft.initialDiscoveredTileIds.filter((candidate) => candidate !== tileId || candidate === state.draft.originTileId),
  });
}

function applySemanticBrush(state: MapEditorState, tileId: string, brush: SemanticBrush): MapEditorState {
  if (brush.kind === "origin") {
    return setOriginTile(state, tileId);
  }

  if (brush.kind === "discovered") {
    return setDiscoveredTile(state, tileId, brush.discovered);
  }

  if (brush.kind === "terrain") {
    return updateGameplayTile(state, tileId, { terrain: brush.value });
  }

  return updateGameplayTile(state, tileId, { weather: brush.value });
}

function commitLayerChange(
  state: MapEditorState,
  layerId: string,
  updateLayer: (layer: MapEditorDraft["visual"]["layers"][number]) => MapEditorDraft["visual"]["layers"][number],
): MapEditorState {
  const layerIndex = state.draft.visual.layers.findIndex((layer) => layer.id === layerId);
  if (layerIndex < 0) {
    return state;
  }

  const currentLayer = state.draft.visual.layers[layerIndex];
  if (!currentLayer) {
    return state;
  }

  const nextLayer = updateLayer(currentLayer);
  if (nextLayer === currentLayer) {
    return state;
  }

  return commitDraftChange(state, {
    ...state.draft,
    visual: {
      ...state.draft.visual,
      layers: state.draft.visual.layers.map((layer, index) => (index === layerIndex ? nextLayer : layer)),
    },
  });
}

function moveLayer(state: MapEditorState, layerId: string, direction: "up" | "down"): MapEditorState {
  const layerIndex = state.draft.visual.layers.findIndex((layer) => layer.id === layerId);
  const targetIndex = direction === "up" ? layerIndex - 1 : layerIndex + 1;
  if (layerIndex < 0 || targetIndex < 0 || targetIndex >= state.draft.visual.layers.length) {
    return state;
  }

  const nextLayers = [...state.draft.visual.layers];
  const [layer] = nextLayers.splice(layerIndex, 1);
  if (!layer) {
    return state;
  }
  nextLayers.splice(targetIndex, 0, layer);

  return commitDraftChange(state, {
    ...state.draft,
    visual: {
      ...state.draft.visual,
      layers: nextLayers,
    },
  });
}

function deleteLayer(state: MapEditorState, layerId: string): MapEditorState {
  const layerIndex = state.draft.visual.layers.findIndex((layer) => layer.id === layerId);
  if (layerIndex < 0) {
    return state;
  }

  const nextLayers = state.draft.visual.layers.filter((layer) => layer.id !== layerId);
  const nextState = commitDraftChange(state, {
    ...state.draft,
    visual: {
      ...state.draft.visual,
      layers: nextLayers,
    },
  });

  if (state.activeLayerId !== layerId) {
    return nextState;
  }

  return {
    ...nextState,
    activeLayerId: nextLayers[Math.min(layerIndex, nextLayers.length - 1)]?.id ?? null,
  };
}

function commitDraftChange(state: MapEditorState, nextDraft: MapEditorDraft): MapEditorState {
  if (nextDraft === state.draft) {
    return state;
  }

  const nextPast = [...state.history.past, state.draft].slice(-MAP_EDITOR_HISTORY_LIMIT);
  return {
    ...state,
    draft: nextDraft,
    history: {
      past: nextPast,
      future: [],
    },
  };
}

function undo(state: MapEditorState): MapEditorState {
  const previousDraft = state.history.past[state.history.past.length - 1];
  if (!previousDraft) {
    return state;
  }

  return {
    ...state,
    draft: previousDraft,
    history: {
      past: state.history.past.slice(0, -1),
      future: [state.draft, ...state.history.future].slice(0, MAP_EDITOR_HISTORY_LIMIT),
    },
  };
}

function redo(state: MapEditorState): MapEditorState {
  const nextDraft = state.history.future[0];
  if (!nextDraft) {
    return state;
  }

  return {
    ...state,
    draft: nextDraft,
    history: {
      past: [...state.history.past, state.draft].slice(-MAP_EDITOR_HISTORY_LIMIT),
      future: state.history.future.slice(1),
    },
  };
}

function areTilesEqual(left: MapTileDefinition, right: MapTileDefinition): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
