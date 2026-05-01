import { getTileId, isTileInsideDraft, parseTileId } from "./mapEditorModel";
import type { MapEditorDraft, MapVisualCellDefinition, MapVisualLayerDefinition } from "./types";

export function paintVisualCell(
  draft: MapEditorDraft,
  layerId: string | null,
  tileId: string,
  cell: MapVisualCellDefinition,
): MapEditorDraft {
  if (!isTileInsideDraft(draft, tileId)) {
    return draft;
  }

  return updateVisualLayerCells(draft, layerId, (layer) => {
    if (areVisualCellsEqual(layer.cells[tileId], cell)) {
      return layer.cells;
    }

    return {
      ...layer.cells,
      [tileId]: { ...cell },
    };
  });
}

export function eraseVisualCell(draft: MapEditorDraft, layerId: string | null, tileId: string): MapEditorDraft {
  if (!isTileInsideDraft(draft, tileId)) {
    return draft;
  }

  return updateVisualLayerCells(draft, layerId, (layer) => {
    if (!layer.cells[tileId]) {
      return layer.cells;
    }

    const nextCells = { ...layer.cells };
    delete nextCells[tileId];
    return nextCells;
  });
}

export function bucketFillVisualCells(
  draft: MapEditorDraft,
  layerId: string | null,
  startTileId: string,
  cell: MapVisualCellDefinition,
): MapEditorDraft {
  if (!isTileInsideDraft(draft, startTileId)) {
    return draft;
  }

  return updateVisualLayerCells(draft, layerId, (layer) => {
    const targetCell = layer.cells[startTileId];
    if (areVisualCellsEqual(targetCell, cell)) {
      return layer.cells;
    }

    const tileIdsToFill = collectContiguousTileIds(draft, layer.cells, startTileId, targetCell);
    if (tileIdsToFill.length === 0) {
      return layer.cells;
    }

    const nextCells = { ...layer.cells };
    for (const tileId of tileIdsToFill) {
      nextCells[tileId] = { ...cell };
    }
    return nextCells;
  });
}

export function rectangleFillVisualCells(
  draft: MapEditorDraft,
  layerId: string | null,
  fromTileId: string,
  toTileId: string,
  cell: MapVisualCellDefinition,
): MapEditorDraft {
  const from = parseTileId(fromTileId);
  const to = parseTileId(toTileId);
  if (!from || !to) {
    return draft;
  }

  const minRow = Math.max(1, Math.min(from.row, to.row));
  const maxRow = Math.min(draft.size.rows, Math.max(from.row, to.row));
  const minCol = Math.max(1, Math.min(from.col, to.col));
  const maxCol = Math.min(draft.size.cols, Math.max(from.col, to.col));
  if (minRow > maxRow || minCol > maxCol) {
    return draft;
  }

  return updateVisualLayerCells(draft, layerId, (layer) => {
    let changed = false;
    const nextCells = { ...layer.cells };
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const tileId = getTileId(row, col);
        if (!areVisualCellsEqual(nextCells[tileId], cell)) {
          nextCells[tileId] = { ...cell };
          changed = true;
        }
      }
    }
    return changed ? nextCells : layer.cells;
  });
}

function updateVisualLayerCells(
  draft: MapEditorDraft,
  layerId: string | null,
  updateCells: (layer: MapVisualLayerDefinition) => Record<string, MapVisualCellDefinition>,
): MapEditorDraft {
  if (!layerId) {
    return draft;
  }

  const layerIndex = draft.visual.layers.findIndex((layer) => layer.id === layerId);
  if (layerIndex < 0) {
    return draft;
  }

  const layer = draft.visual.layers[layerIndex];
  if (!layer || layer.locked) {
    return draft;
  }

  const nextCells = updateCells(layer);
  if (nextCells === layer.cells) {
    return draft;
  }

  const nextLayers = draft.visual.layers.map((candidate, index) =>
    index === layerIndex ? { ...candidate, cells: nextCells } : candidate,
  );

  return {
    ...draft,
    visual: {
      ...draft.visual,
      layers: nextLayers,
    },
  };
}

function collectContiguousTileIds(
  draft: MapEditorDraft,
  cells: Record<string, MapVisualCellDefinition>,
  startTileId: string,
  targetCell: MapVisualCellDefinition | undefined,
): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const queue = [startTileId];

  while (queue.length > 0) {
    const tileId = queue.shift();
    if (!tileId || visited.has(tileId) || !isTileInsideDraft(draft, tileId)) {
      continue;
    }
    visited.add(tileId);

    if (!areVisualCellsEqual(cells[tileId], targetCell)) {
      continue;
    }

    result.push(tileId);
    const point = parseTileId(tileId);
    if (!point) {
      continue;
    }

    queue.push(
      getTileId(point.row - 1, point.col),
      getTileId(point.row + 1, point.col),
      getTileId(point.row, point.col - 1),
      getTileId(point.row, point.col + 1),
    );
  }

  return result;
}

function areVisualCellsEqual(
  left: MapVisualCellDefinition | undefined,
  right: MapVisualCellDefinition | undefined,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.tilesetId === right.tilesetId && left.tileIndex === right.tileIndex;
}
