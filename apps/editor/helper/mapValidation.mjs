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
  validateMapFeatures(data.features, { rows, cols, hasValidSize, issues });
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

function validateMapFeatures(featuresValue, { rows, cols, hasValidSize, issues }) {
  if (featuresValue === undefined) {
    return;
  }

  if (!Array.isArray(featuresValue)) {
    pushIssue(issues, {
      code: "features_not_array",
      message: "Map features must be an array.",
      path: "/features",
      target: { kind: "map", field: "features" },
    });
    return;
  }

  const featureIds = new Set();
  for (const [featureIndex, feature] of featuresValue.entries()) {
    const featurePath = `/features/${featureIndex}`;
    if (!feature || typeof feature !== "object" || Array.isArray(feature)) {
      pushIssue(issues, {
        code: "feature_not_object",
        message: "Map feature must be an object.",
        path: featurePath,
        target: { kind: "feature" },
      });
      continue;
    }

    const featureId = typeof feature.id === "string" && feature.id.length > 0 ? feature.id : `<index:${featureIndex}>`;
    if (typeof feature.id === "string") {
      if (featureIds.has(feature.id)) {
        pushFeatureIssue(issues, {
          code: "duplicate_feature_id",
          message: `Duplicate map feature id: ${feature.id}.`,
          path: `${featurePath}/id`,
          featureId,
          field: "id",
        });
      } else {
        featureIds.add(feature.id);
      }
    }

    validateFeatureFootprint(feature.footprint, {
      rows,
      cols,
      hasValidSize,
      issues,
      featurePath,
      featureId,
    });
  }
}

function validateFeatureFootprint(footprint, { rows, cols, hasValidSize, issues, featurePath, featureId }) {
  if (!footprint || typeof footprint !== "object" || Array.isArray(footprint) || footprint.type !== "row_spans") {
    pushFeatureIssue(issues, {
      code: "unsupported_feature_footprint",
      message: "Map feature footprint must use row_spans.",
      path: `${featurePath}/footprint`,
      featureId,
      field: "footprint",
    });
    return;
  }

  if (!Array.isArray(footprint.spans) || footprint.spans.length === 0) {
    pushFeatureIssue(issues, {
      code: "feature_footprint_empty",
      message: "Map feature footprint spans must not be empty.",
      path: `${featurePath}/footprint/spans`,
      featureId,
      field: "footprint.spans",
    });
    return;
  }

  const coveredTileIds = new Set();
  for (const [spanIndex, span] of footprint.spans.entries()) {
    const field = `footprint.spans[${spanIndex}]`;
    const path = `${featurePath}/footprint/spans/${spanIndex}`;
    if (!span || typeof span !== "object" || Array.isArray(span)) {
      pushFeatureIssue(issues, {
        code: "feature_span_not_object",
        message: "Map feature row span must be an object.",
        path,
        featureId,
        field,
      });
      continue;
    }

    const { row, colStart, colEnd } = span;
    if (!Number.isInteger(row) || !Number.isInteger(colStart) || !Number.isInteger(colEnd)) {
      pushFeatureIssue(issues, {
        code: "feature_span_invalid_coordinates",
        message: "Map feature row span coordinates must be integers.",
        path,
        featureId,
        field,
      });
      continue;
    }

    let spanHasError = false;
    if (colStart > colEnd) {
      spanHasError = true;
      pushFeatureIssue(issues, {
        code: "feature_span_invalid_range",
        message: "Map feature row span colStart must be <= colEnd.",
        path,
        featureId,
        field,
      });
    }

    if (hasValidSize && (!isInsideMapCoordinate({ rows, cols }, row, colStart) || !isInsideMapCoordinate({ rows, cols }, row, colEnd))) {
      spanHasError = true;
      pushFeatureIssue(issues, {
        code: "feature_span_out_of_bounds",
        message: `Map feature row span is outside ${rows} x ${cols}.`,
        path,
        featureId,
        field,
      });
    }

    if (spanHasError) {
      continue;
    }

    let overlapsPreviousSpan = false;
    for (let col = colStart; col <= colEnd; col += 1) {
      if (coveredTileIds.has(`${row}-${col}`)) {
        overlapsPreviousSpan = true;
        break;
      }
    }

    if (overlapsPreviousSpan) {
      pushFeatureIssue(issues, {
        code: "feature_span_overlap",
        message: "Map feature row span overlaps another span in the same feature.",
        path,
        featureId,
        field,
      });
    }

    for (let col = colStart; col <= colEnd; col += 1) {
      coveredTileIds.add(`${row}-${col}`);
    }
  }

  if (coveredTileIds.size > 0) {
    validateFeatureFootprintContiguous(coveredTileIds, { issues, featurePath, featureId });
  }
}

function validateFeatureFootprintContiguous(coveredTileIds, { issues, featurePath, featureId }) {
  const firstTileId = coveredTileIds.values().next().value;
  if (typeof firstTileId !== "string") {
    return;
  }

  const visited = new Set([firstTileId]);
  const stack = [firstTileId];
  while (stack.length > 0) {
    const tileId = stack.pop();
    const coord = parseTileCoord(tileId);
    if (!coord) {
      continue;
    }

    for (const neighbor of [
      `${coord.row - 1}-${coord.col}`,
      `${coord.row + 1}-${coord.col}`,
      `${coord.row}-${coord.col - 1}`,
      `${coord.row}-${coord.col + 1}`,
    ]) {
      if (!coveredTileIds.has(neighbor) || visited.has(neighbor)) {
        continue;
      }
      visited.add(neighbor);
      stack.push(neighbor);
    }
  }

  if (visited.size !== coveredTileIds.size) {
    pushFeatureIssue(issues, {
      code: "feature_footprint_not_contiguous",
      message: "Map feature footprint must be four-direction contiguous.",
      path: `${featurePath}/footprint/spans`,
      featureId,
      field: "footprint.spans",
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

function parseTileCoord(tileId) {
  const match = /^(\d+)-(\d+)$/.exec(tileId);
  if (!match) {
    return null;
  }

  return { row: Number(match[1]), col: Number(match[2]) };
}

function isInsideMapCoordinate({ rows, cols }, row, col) {
  return row >= 1 && row <= rows && col >= 1 && col <= cols;
}

function pushFeatureIssue(issues, { code, message, path, featureId, field }) {
  pushIssue(issues, {
    code,
    message,
    path,
    target: { kind: "feature", featureId, field },
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
