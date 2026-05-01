export function validateMapEditorMap(data, { mapObjects = [], tilesetRegistry = { tilesets: [] } } = {}) {
  const issues = [];
  const objectIds = new Set(mapObjects.map((object) => object.id).filter(Boolean));
  const tilesetsById = new Map((tilesetRegistry.tilesets ?? []).map((tileset) => [tileset.id, tileset]));

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    pushIssue(issues, {
      code: "map_not_object",
      message: "Map content must be a JSON object.",
      path: "/",
      target: { kind: "map" },
    });
    return toResult(issues);
  }

  const rows = data.size?.rows;
  const cols = data.size?.cols;
  const hasValidSize = Number.isInteger(rows) && rows >= 1 && Number.isInteger(cols) && cols >= 1;
  if (!hasValidSize) {
    pushIssue(issues, {
      code: "invalid_map_size",
      message: "Map size must include positive integer rows and cols.",
      path: "/size",
      target: { kind: "map", field: "size" },
    });
  }

  const tiles = Array.isArray(data.tiles) ? data.tiles : [];
  if (!Array.isArray(data.tiles)) {
    pushIssue(issues, {
      code: "tiles_not_array",
      message: "Map tiles must be an array.",
      path: "/tiles",
      target: { kind: "map", field: "tiles" },
    });
  }

  const tileById = new Map();
  const tileIds = new Set();

  for (const [tileIndex, tile] of tiles.entries()) {
    const tilePath = `/tiles/${tileIndex}`;
    if (!tile || typeof tile !== "object" || Array.isArray(tile)) {
      pushIssue(issues, {
        code: "tile_not_object",
        message: "Map tile must be an object.",
        path: tilePath,
        target: { kind: "tile" },
      });
      continue;
    }

    if (tileIds.has(tile.id)) {
      pushIssue(issues, {
        code: "duplicate_tile_id",
        message: `Duplicate map tile id: ${tile.id}.`,
        path: `${tilePath}/id`,
        target: { kind: "tile", tileId: tile.id, field: "id" },
      });
    } else if (typeof tile.id === "string") {
      tileIds.add(tile.id);
      tileById.set(tile.id, tile);
    }

    const expectedTileId = `${tile.row}-${tile.col}`;
    if (typeof tile.id === "string" && Number.isInteger(tile.row) && Number.isInteger(tile.col) && tile.id !== expectedTileId) {
      pushIssue(issues, {
        code: "tile_id_coordinate_mismatch",
        message: `Map tile id must match row/col: ${tile.id} should be ${expectedTileId}.`,
        path: `${tilePath}/id`,
        target: { kind: "tile", tileId: tile.id, field: "id" },
      });
    }

    if (hasValidSize && (!Number.isInteger(tile.row) || tile.row < 1 || tile.row > rows || !Number.isInteger(tile.col) || tile.col < 1 || tile.col > cols)) {
      pushIssue(issues, {
        code: "tile_coordinate_out_of_bounds",
        message: `Map tile coordinate is outside ${rows} x ${cols}: ${tile.id ?? tileIndex}.`,
        path: tilePath,
        target: { kind: "tile", tileId: tile.id, field: "coordinate" },
      });
    }

    for (const [objectIndex, objectId] of (Array.isArray(tile.objectIds) ? tile.objectIds : []).entries()) {
      if (!objectIds.has(objectId)) {
        pushIssue(issues, {
          code: "unknown_object_id",
          message: `Unknown objectId in tile ${tile.id}: ${objectId}.`,
          path: `${tilePath}/objectIds/${objectIndex}`,
          target: { kind: "tile", tileId: tile.id, field: "objectIds" },
        });
      }
    }
  }

  validateTileReferences(data, tileById, issues);
  if (hasValidSize) {
    validateCoverage({ rows, cols, tileById, tileCount: tiles.length, issues });
  }
  validateVisualLayers(data.visual, { tileById, tilesetsById, issues });

  return toResult(issues);
}

function validateTileReferences(data, tileById, issues) {
  if (typeof data.originTileId !== "string" || !tileById.has(data.originTileId)) {
    pushIssue(issues, {
      code: "unknown_origin_tile_id",
      message: `Map originTileId does not exist: ${data.originTileId}.`,
      path: "/originTileId",
      target: { kind: "tile", tileId: data.originTileId, field: "originTileId" },
    });
  }

  const initialDiscoveredTileIds = Array.isArray(data.initialDiscoveredTileIds) ? data.initialDiscoveredTileIds : [];
  for (const [index, tileId] of initialDiscoveredTileIds.entries()) {
    if (!tileById.has(tileId)) {
      pushIssue(issues, {
        code: "unknown_initial_discovered_tile_id",
        message: `Unknown initialDiscoveredTileId: ${tileId}.`,
        path: `/initialDiscoveredTileIds/${index}`,
        target: { kind: "tile", tileId, field: "initialDiscoveredTileIds" },
      });
    }
  }

  if (typeof data.originTileId === "string" && !initialDiscoveredTileIds.includes(data.originTileId)) {
    pushIssue(issues, {
      code: "origin_not_initially_discovered",
      message: `Map initialDiscoveredTileIds must include originTileId: ${data.originTileId}.`,
      path: "/initialDiscoveredTileIds",
      target: { kind: "tile", tileId: data.originTileId, field: "initialDiscoveredTileIds" },
    });
  }
}

function validateCoverage({ rows, cols, tileById, tileCount, issues }) {
  for (let row = 1; row <= rows; row += 1) {
    for (let col = 1; col <= cols; col += 1) {
      const tileId = `${row}-${col}`;
      if (!tileById.has(tileId)) {
        pushIssue(issues, {
          code: "missing_tile",
          message: `Missing map tile for complete coverage: ${tileId}.`,
          path: "/tiles",
          target: { kind: "tile", tileId },
        });
      }
    }
  }

  if (tileById.size !== rows * cols || tileCount !== rows * cols) {
    pushIssue(issues, {
      code: "tile_count_mismatch",
      message: `Map tile count must match size coverage: expected ${rows * cols}, got ${tileCount}.`,
      path: "/tiles",
      target: { kind: "map", field: "tiles" },
    });
  }
}

function validateVisualLayers(visual, { tileById, tilesetsById, issues }) {
  if (visual === undefined) {
    return;
  }

  const layers = Array.isArray(visual?.layers) ? visual.layers : [];
  if (!Array.isArray(visual?.layers)) {
    pushIssue(issues, {
      code: "visual_layers_not_array",
      message: "Map visual.layers must be an array when visual is present.",
      path: "/visual/layers",
      target: { kind: "map", field: "visual.layers" },
    });
    return;
  }

  const layerIds = new Set();
  for (const [layerIndex, layer] of layers.entries()) {
    const layerPath = `/visual/layers/${layerIndex}`;
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
      pushIssue(issues, {
        code: "visual_layer_not_object",
        message: "Visual layer must be an object.",
        path: layerPath,
        target: { kind: "layer" },
      });
      continue;
    }

    if (layerIds.has(layer.id)) {
      pushIssue(issues, {
        code: "duplicate_visual_layer_id",
        message: `Duplicate visual layer id: ${layer.id}.`,
        path: `${layerPath}/id`,
        target: { kind: "layer", layerId: layer.id, field: "id" },
      });
    } else if (typeof layer.id === "string") {
      layerIds.add(layer.id);
    }

    validateVisualCells(layer.cells, { layer, layerPath, tileById, tilesetsById, issues });
  }
}

function validateVisualCells(cells, { layer, layerPath, tileById, tilesetsById, issues }) {
  if (cells === undefined) {
    return;
  }

  if (!cells || typeof cells !== "object" || Array.isArray(cells)) {
    pushIssue(issues, {
      code: "visual_cells_not_object",
      message: "Visual layer cells must be an object.",
      path: `${layerPath}/cells`,
      target: { kind: "layer", layerId: layer.id, field: "cells" },
    });
    return;
  }

  for (const [tileId, cell] of Object.entries(cells)) {
    const cellPath = `${layerPath}/cells/${escapeJsonPointer(tileId)}`;
    if (!tileById.has(tileId)) {
      pushIssue(issues, {
        code: "unknown_visual_cell_tile_id",
        message: `Unknown visual cell tileId in layer ${layer.id}: ${tileId}.`,
        path: cellPath,
        target: { kind: "cell", tileId, layerId: layer.id, field: "tileId" },
      });
    }

    const tileset = tilesetsById.get(cell?.tilesetId);
    if (!tileset) {
      pushIssue(issues, {
        code: "unknown_tileset_id",
        message: `Unknown visual cell tilesetId in layer ${layer.id}/${tileId}: ${cell?.tilesetId}.`,
        path: `${cellPath}/tilesetId`,
        target: { kind: "cell", tileId, layerId: layer.id, tilesetId: cell?.tilesetId, field: "tilesetId" },
      });
      continue;
    }

    if (!Number.isInteger(cell.tileIndex) || cell.tileIndex < 0 || cell.tileIndex >= tileset.tileCount) {
      pushIssue(issues, {
        code: "tile_index_out_of_bounds",
        message: `Visual cell tileIndex out of bounds in layer ${layer.id}/${tileId}: ${cell.tileIndex} for ${cell.tilesetId}.`,
        path: `${cellPath}/tileIndex`,
        target: { kind: "cell", tileId, layerId: layer.id, tilesetId: cell.tilesetId, field: "tileIndex" },
      });
    }
  }
}

function pushIssue(issues, { code, message, path, target }) {
  issues.push({
    severity: "error",
    code,
    message,
    path,
    ...(target ? { target } : {}),
  });
}

function toResult(issues) {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function escapeJsonPointer(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}
