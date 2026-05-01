import {
  bucketFillVisualCells,
  eraseVisualCell,
  paintVisualCell,
  rectangleFillVisualCells,
} from "./visualLayerOps";
import type { MapEditorCommand, MapEditorDraft, MapEditorState } from "./types";

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
    case "history/undo":
      return undo(state);
    case "history/redo":
      return redo(state);
    default:
      return state;
  }
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
