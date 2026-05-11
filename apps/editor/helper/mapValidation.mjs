export function validateMapEditorMap(data, { mapObjects = [] } = {}) {
  const issues = [];
  const objectIds = new Set(mapObjects.map((object) => object.id).filter(Boolean));

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

  if (typeof data.radarPath !== "string" || !/^content\/maps\/radar\/[a-z][a-z0-9_-]*\.json$/.test(data.radarPath)) {
    pushIssue(issues, {
      code: "invalid_radar_path",
      message: "Map radarPath must be content/maps/radar/<file>.json.",
      path: "/radarPath",
      target: { kind: "radar", field: "radarPath" },
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
  validateRadar(data.radar, { rows, cols, issues });

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

function validateRadar(radar, { rows, cols, issues }) {
  if (!radar || typeof radar !== "object" || Array.isArray(radar)) {
    pushIssue(issues, {
      code: "missing_radar",
      message: "Map radar presentation data is required.",
      path: "/radar",
      target: { kind: "radar", field: "radar" },
    });
    return;
  }

  if (radar.world?.width !== cols || radar.world?.height !== rows) {
    pushIssue(issues, {
      code: "radar_world_size_mismatch",
      message: `Radar world must match map size: expected ${cols} x ${rows}.`,
      path: "/radar/world",
      target: { kind: "radar", field: "world" },
    });
  }

  validateRadarRows(radar.glyphRows, { rows, cols, field: "glyphRows", issues });
  validateRadarRows(radar.toneRows, { rows, cols, field: "toneRows", issues });

  const toneKeys = new Set(Object.keys(radar.palette ?? {}));
  for (const [rowIndex, row] of (Array.isArray(radar.toneRows) ? radar.toneRows : []).entries()) {
    for (const [colIndex, tone] of [...row].entries()) {
      if (!toneKeys.has(tone)) {
        pushIssue(issues, {
          code: "unknown_radar_tone",
          message: `Radar tone "${tone}" is not in radar.palette.`,
          path: `/radar/toneRows/${rowIndex}/${colIndex}`,
          target: { kind: "radar", field: "toneRows" },
        });
      }
    }
  }
}

function validateRadarRows(value, { rows, cols, field, issues }) {
  if (!Array.isArray(value) || value.length !== rows) {
    pushIssue(issues, {
      code: `invalid_radar_${field}`,
      message: `Radar ${field} must contain ${rows} rows.`,
      path: `/radar/${field}`,
      target: { kind: "radar", field },
    });
    return;
  }

  value.forEach((row, index) => {
    if (typeof row !== "string" || row.length !== cols) {
      pushIssue(issues, {
        code: `invalid_radar_${field}_row`,
        message: `Radar ${field}[${index}] must be a string with ${cols} characters.`,
        path: `/radar/${field}/${index}`,
        target: { kind: "radar", field },
      });
    }
  });
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
