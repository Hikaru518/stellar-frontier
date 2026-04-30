export type DemoTerrain = "deepWater" | "water" | "beach" | "grass" | "forest" | "mountain" | "road" | "village";
export type DemoDetail = "forest" | "mountain" | "building" | "dock" | "tower" | null;
export type DemoSubTileTerrain = "grass" | "flower" | "forest" | "water" | "sand" | "road" | "rock" | "house";

export interface RoadConnections {
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
}

export interface PerformanceDemoTile {
  id: string;
  row: number;
  col: number;
  terrain: DemoTerrain;
  detail: DemoDetail;
  roads?: RoadConnections;
}

export interface DemoTileDetails {
  areaName: string;
  terrainLabel: string;
  speciesLabel: string;
  description: string;
}

export interface DemoTileAction {
  id: string;
  label: string;
  description: string;
}

export interface PerformanceDemoSubTile {
  id: string;
  row: number;
  col: number;
  terrain: DemoSubTileTerrain;
}

export const PERFORMANCE_DEMO_SIZE = 100;
export const PERFORMANCE_DEMO_SUBMAP_SIZE = 20;

export function createPerformanceDemoTiles(size = PERFORMANCE_DEMO_SIZE): PerformanceDemoTile[] {
  const tiles: PerformanceDemoTile[] = [];
  const centerLeft = { row: Math.floor(size * 0.42), col: Math.floor(size * 0.32) };
  const centerRight = { row: Math.floor(size * 0.45), col: Math.floor(size * 0.68) };

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const landNoise = wave(row * 0.09, col * 0.07) + wave(row * 0.03 + 2.1, col * 0.05 - 1.7);
      const leftMass = islandFalloff(row, col, centerLeft.row, centerLeft.col, size * 0.32, size * 0.24);
      const rightMass = islandFalloff(row, col, centerRight.row, centerRight.col, size * 0.36, size * 0.21);
      const southernMass = islandFalloff(row, col, size * 0.88, size * 0.5, size * 0.4, size * 0.12);
      const landScore = Math.max(leftMass, rightMass, southernMass) + landNoise * 0.11;
      const terrain = chooseTerrain({ row, col, size, landScore, centerLeft, centerRight });
      tiles.push({
        id: `${row}-${col}`,
        row,
        col,
        terrain,
        detail: chooseDetail({ row, col, terrain, centerLeft, centerRight }),
      });
    }
  }

  return tiles;
}

export function getDemoTerrainLabel(terrain: DemoTerrain) {
  switch (terrain) {
    case "deepWater":
      return "深水";
    case "water":
      return "水面";
    case "beach":
      return "沙滩";
    case "grass":
      return "草地";
    case "forest":
      return "森林";
    case "mountain":
      return "山地";
    case "road":
      return "道路";
    case "village":
      return "村落";
  }
}

export function getDemoTileDetails(tile: PerformanceDemoTile): DemoTileDetails {
  switch (tile.terrain) {
    case "grass":
      return {
        areaName: "青草平原",
        terrainLabel: getDemoTerrainLabel(tile.terrain),
        speciesLabel: grassSpecies(tile),
        description: "开阔、湿润、适合进行轻量种植实验。",
      };
    case "forest":
      return {
        areaName: "密林边缘",
        terrainLabel: getDemoTerrainLabel(tile.terrain),
        speciesLabel: "黑松与银叶灌木混生林",
        description: "林下视野有限，有小型动物活动痕迹。",
      };
    case "mountain":
      return {
        areaName: "褐岩山脊",
        terrainLabel: getDemoTerrainLabel(tile.terrain),
        speciesLabel: "风化砂岩与低矮苔衣",
        description: "坡度较高，通行缓慢，不适合种植。",
      };
    case "beach":
      return {
        areaName: "浅滩海岸",
        terrainLabel: getDemoTerrainLabel(tile.terrain),
        speciesLabel: "盐生短草与细沙",
        description: "临水地带，可作为码头或观察点。",
      };
    case "road":
      return {
        areaName: "土路",
        terrainLabel: getDemoTerrainLabel(tile.terrain),
        speciesLabel: "压实沙土",
        description: "适合移动，不适合采集。",
      };
    case "village":
      return {
        areaName: "村落空地",
        terrainLabel: getDemoTerrainLabel(tile.terrain),
        speciesLabel: "人工修整草坪",
        description: "有房屋和基础设施，可进行互动测试。",
      };
    case "water":
    case "deepWater":
      return {
        areaName: tile.terrain === "deepWater" ? "深水区" : "水面",
        terrainLabel: getDemoTerrainLabel(tile.terrain),
        speciesLabel: "水生藻类",
        description: "不可步行通过，只用于观察和航道表现。",
      };
  }
}

export function getDemoTileActions(tile: PerformanceDemoTile): DemoTileAction[] {
  if (tile.terrain === "grass") {
    return [{ id: "plant_flower", label: "种花", description: "在这片草地上种一小片耐寒野花。" }];
  }
  if (tile.terrain === "forest") {
    return [
      { id: "plant_tree", label: "种树", description: "补种一棵黑松幼苗。" },
      { id: "hunt", label: "捕猎", description: "尝试追踪林中的小型动物。" },
    ];
  }
  if (tile.terrain === "village") {
    return [{ id: "inspect_house", label: "查看房屋", description: "记录建筑结构和入口。" }];
  }
  return [];
}

export function isPerformanceDemoTileWalkable(tile: PerformanceDemoTile) {
  return tile.terrain !== "water" && tile.terrain !== "deepWater";
}

export function createPerformanceDemoSubTiles(tile: PerformanceDemoTile, size = PERFORMANCE_DEMO_SUBMAP_SIZE): PerformanceDemoSubTile[] {
  const tiles: PerformanceDemoSubTile[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      tiles.push({
        id: `${row}-${col}`,
        row,
        col,
        terrain: chooseSubTileTerrain(tile, row, col, size),
      });
    }
  }
  return tiles;
}

export function getDemoSubTileTerrainLabel(terrain: DemoSubTileTerrain) {
  switch (terrain) {
    case "grass":
      return "草地";
    case "flower":
      return "花丛";
    case "forest":
      return "树林";
    case "water":
      return "水塘";
    case "sand":
      return "沙地";
    case "road":
      return "小路";
    case "rock":
      return "岩石";
    case "house":
      return "房屋";
  }
}

// Only road sub-tiles are walkable — character must stay on the road network.
export function isPerformanceDemoSubTileWalkable(tile: PerformanceDemoSubTile) {
  return tile.terrain === "road";
}

// Road corridor half-width in sub-tiles (1 → road is 3 sub-tiles wide: center ± 1).
const ROAD_HALF_WIDTH = 1;

/**
 * Overlays a road network onto an existing sub-tile array.
 * Roads run along the center axis (sub-row/col 10 ± ROAD_HALF_WIDTH) of the tile,
 * connecting every active edge at the midpoint so sub-maps are seamlessly joined.
 */
export function applyRoadsToSubTiles(
  subTiles: PerformanceDemoSubTile[],
  roads: RoadConnections,
  size = PERFORMANCE_DEMO_SUBMAP_SIZE,
): PerformanceDemoSubTile[] {
  const hasNS = roads.north || roads.south;
  const hasEW = roads.east || roads.west;
  if (!hasNS && !hasEW) return subTiles;

  const center = Math.floor(size / 2); // 10 for size = 20
  const roadIndices = new Set<number>();

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const onVertical = hasNS && Math.abs(c - center) <= ROAD_HALF_WIDTH;
      const onHorizontal = hasEW && Math.abs(r - center) <= ROAD_HALF_WIDTH;
      if (onVertical || onHorizontal) {
        roadIndices.add(r * size + c);
      }
    }
  }

  return subTiles.map((tile, idx) =>
    roadIndices.has(idx) ? { ...tile, terrain: "road" as DemoSubTileTerrain } : tile,
  );
}

export function findPerformanceDemoSubPath(tiles: PerformanceDemoSubTile[], size: number, fromId: string, toId: string): PerformanceDemoSubTile[] {
  const tileById = new Map(tiles.map((tile) => [tile.id, tile]));
  const start = tileById.get(fromId);
  const target = tileById.get(toId);
  if (!start || !target || !isPerformanceDemoSubTileWalkable(start) || !isPerformanceDemoSubTileWalkable(target)) {
    return [];
  }

  const queue = [start.id];
  const visited = new Set([start.id]);
  const previous = new Map<string, string>();
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      break;
    }
    if (currentId === target.id) {
      return buildSubPath(previous, tileById, start.id, target.id);
    }
    const current = tileById.get(currentId);
    if (!current) {
      continue;
    }
    for (const neighbor of getDemoSubNeighbors(current, size, tileById)) {
      if (visited.has(neighbor.id) || !isPerformanceDemoSubTileWalkable(neighbor)) {
        continue;
      }
      visited.add(neighbor.id);
      previous.set(neighbor.id, current.id);
      queue.push(neighbor.id);
    }
  }
  return [];
}

// ── Global 60×60 grid (3 world tiles × 20 sub-tiles per axis) ──────────────

export interface GlobalSubTile {
  globalId: string;
  globalRow: number;
  globalCol: number;
  worldRow: number;
  worldCol: number;
  subTile: PerformanceDemoSubTile;
}

export function buildGlobalSubTileGrid(worldTiles: PerformanceDemoTile[]): GlobalSubTile[] {
  return worldTiles.flatMap((worldTile) => {
    const baseSubTiles = createPerformanceDemoSubTiles(worldTile);
    const subTiles = worldTile.roads ? applyRoadsToSubTiles(baseSubTiles, worldTile.roads) : baseSubTiles;
    return subTiles.map((subTile) => {
      const globalRow = worldTile.row * PERFORMANCE_DEMO_SUBMAP_SIZE + subTile.row;
      const globalCol = worldTile.col * PERFORMANCE_DEMO_SUBMAP_SIZE + subTile.col;
      return {
        globalId: `${globalRow}-${globalCol}`,
        globalRow,
        globalCol,
        worldRow: worldTile.row,
        worldCol: worldTile.col,
        subTile,
      };
    });
  });
}

export function findGlobalPath(
  globalGrid: GlobalSubTile[],
  globalSize: number,
  fromGlobalId: string,
  toGlobalId: string,
): GlobalSubTile[] {
  const byId = new Map(globalGrid.map((t) => [t.globalId, t]));
  const start = byId.get(fromGlobalId);
  const target = byId.get(toGlobalId);
  if (!start || !target || !isPerformanceDemoSubTileWalkable(start.subTile) || !isPerformanceDemoSubTileWalkable(target.subTile)) {
    return [];
  }

  const queue = [start.globalId];
  const visited = new Set([start.globalId]);
  const previous = new Map<string, string>();

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) break;
    if (currentId === target.globalId) {
      return buildGlobalPathResult(previous, byId, start.globalId, target.globalId);
    }
    const current = byId.get(currentId);
    if (!current) continue;
    for (const [dr, dc] of [
      [-1, 0],
      [0, 1],
      [1, 0],
      [0, -1],
    ] as const) {
      const nr = current.globalRow + dr;
      const nc = current.globalCol + dc;
      if (nr < 0 || nr >= globalSize || nc < 0 || nc >= globalSize) continue;
      const nId = `${nr}-${nc}`;
      if (visited.has(nId)) continue;
      const n = byId.get(nId);
      if (!n || !isPerformanceDemoSubTileWalkable(n.subTile)) continue;
      visited.add(nId);
      previous.set(nId, currentId);
      queue.push(nId);
    }
  }
  return [];
}

function buildGlobalPathResult(
  previous: Map<string, string>,
  byId: Map<string, GlobalSubTile>,
  fromId: string,
  toId: string,
): GlobalSubTile[] {
  const pathIds = [toId];
  let cursor = toId;
  while (cursor !== fromId) {
    const prev = previous.get(cursor);
    if (!prev) return [];
    pathIds.push(prev);
    cursor = prev;
  }
  return pathIds
    .reverse()
    .map((id) => byId.get(id))
    .filter((t): t is GlobalSubTile => Boolean(t));
}

function grassSpecies(tile: PerformanceDemoTile) {
  const variants = ["蓝穗针茅", "银边地衣草", "短叶星纹草"];
  return variants[(tile.row + tile.col) % variants.length];
}

export function findPerformanceDemoPath(tiles: PerformanceDemoTile[], size: number, fromId: string, toId: string): PerformanceDemoTile[] {
  const tileById = new Map(tiles.map((tile) => [tile.id, tile]));
  const start = tileById.get(fromId);
  const target = tileById.get(toId);
  if (!start || !target || !isPerformanceDemoTileWalkable(start) || !isPerformanceDemoTileWalkable(target)) {
    return [];
  }

  const queue = [start.id];
  const visited = new Set([start.id]);
  const previous = new Map<string, string>();

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      break;
    }
    if (currentId === target.id) {
      return buildPath(previous, tileById, start.id, target.id);
    }
    const current = tileById.get(currentId);
    if (!current) {
      continue;
    }
    for (const neighbor of getDemoNeighbors(current, size, tileById)) {
      if (visited.has(neighbor.id) || !isPerformanceDemoTileWalkable(neighbor)) {
        continue;
      }
      visited.add(neighbor.id);
      previous.set(neighbor.id, current.id);
      queue.push(neighbor.id);
    }
  }

  return [];
}

function chooseTerrain({
  row,
  col,
  size,
  landScore,
  centerLeft,
  centerRight,
}: {
  row: number;
  col: number;
  size: number;
  landScore: number;
  centerLeft: { row: number; col: number };
  centerRight: { row: number; col: number };
}): DemoTerrain {
  if (isRoad(row, col, centerLeft, centerRight)) {
    return "road";
  }
  if (isVillage(row, col, centerLeft) || isVillage(row, col, centerRight)) {
    return "village";
  }
  if (landScore < 0.12) {
    return "deepWater";
  }
  if (landScore < 0.26) {
    return "water";
  }
  if (landScore < 0.34) {
    return "beach";
  }
  if (col > size * 0.55 && row > size * 0.24 && row < size * 0.62 && landScore > 0.63) {
    return "mountain";
  }
  if ((col < size * 0.28 || row > size * 0.62) && landScore > 0.52) {
    return "forest";
  }
  return "grass";
}

function chooseDetail({
  row,
  col,
  terrain,
  centerLeft,
  centerRight,
}: {
  row: number;
  col: number;
  terrain: DemoTerrain;
  centerLeft: { row: number; col: number };
  centerRight: { row: number; col: number };
}): DemoDetail {
  if (terrain === "forest" && (row + col) % 5 === 0) {
    return "forest";
  }
  if (terrain === "mountain" && (row * 3 + col) % 4 === 0) {
    return "mountain";
  }
  if (terrain === "village" && (row + col) % 7 === 0) {
    return "building";
  }
  if (terrain === "beach" && (row + col) % 29 === 0) {
    return "dock";
  }
  if ((isVillage(row, col, centerLeft) || isVillage(row, col, centerRight)) && (row * 11 + col) % 37 === 0) {
    return "tower";
  }
  return null;
}

function isRoad(row: number, col: number, left: { row: number; col: number }, right: { row: number; col: number }) {
  const bridgeRow = Math.round(left.row + (right.row - left.row) * ((col - left.col) / Math.max(1, right.col - left.col)));
  return col >= left.col && col <= right.col && Math.abs(row - bridgeRow) <= 1;
}

function getDemoNeighbors(tile: PerformanceDemoTile, size: number, tileById: Map<string, PerformanceDemoTile>) {
  const candidates = [
    [tile.row - 1, tile.col],
    [tile.row, tile.col + 1],
    [tile.row + 1, tile.col],
    [tile.row, tile.col - 1],
  ];
  return candidates.flatMap(([row, col]) => {
    if (row < 0 || row >= size || col < 0 || col >= size) {
      return [];
    }
    const neighbor = tileById.get(`${row}-${col}`);
    return neighbor ? [neighbor] : [];
  });
}

function buildPath(previous: Map<string, string>, tileById: Map<string, PerformanceDemoTile>, fromId: string, toId: string) {
  const pathIds = [toId];
  let cursor = toId;
  while (cursor !== fromId) {
    const prev = previous.get(cursor);
    if (!prev) {
      return [];
    }
    pathIds.push(prev);
    cursor = prev;
  }
  return pathIds
    .reverse()
    .map((id) => tileById.get(id))
    .filter((tile): tile is PerformanceDemoTile => Boolean(tile));
}

function buildSubPath(previous: Map<string, string>, tileById: Map<string, PerformanceDemoSubTile>, fromId: string, toId: string) {
  const pathIds = [toId];
  let cursor = toId;
  while (cursor !== fromId) {
    const prev = previous.get(cursor);
    if (!prev) {
      return [];
    }
    pathIds.push(prev);
    cursor = prev;
  }
  return pathIds
    .reverse()
    .map((id) => tileById.get(id))
    .filter((tile): tile is PerformanceDemoSubTile => Boolean(tile));
}

function getDemoSubNeighbors(tile: PerformanceDemoSubTile, size: number, tileById: Map<string, PerformanceDemoSubTile>) {
  const candidates = [
    [tile.row - 1, tile.col],
    [tile.row, tile.col + 1],
    [tile.row + 1, tile.col],
    [tile.row, tile.col - 1],
  ];
  return candidates.flatMap(([row, col]) => {
    if (row < 0 || row >= size || col < 0 || col >= size) {
      return [];
    }
    const neighbor = tileById.get(`${row}-${col}`);
    return neighbor ? [neighbor] : [];
  });
}

function chooseSubTileTerrain(parent: PerformanceDemoTile, row: number, col: number, size: number): DemoSubTileTerrain {
  const centerScore = islandFalloff(row, col, Math.floor(size / 2), Math.floor(size / 2), size * 0.5, size * 0.5);
  const noise = wave((row + parent.row) * 0.6, (col + parent.col) * 0.5);

  if (Math.abs(row - Math.round(size / 2 + Math.sin(col * 0.8) * 2)) <= 1) {
    return "road";
  }
  if (parent.terrain === "water" || parent.terrain === "deepWater") {
    return centerScore > 0.72 && noise > 0.1 ? "sand" : "water";
  }
  if (parent.terrain === "beach") {
    return row < 4 || col > size - 4 ? "water" : noise > 0.2 ? "sand" : "grass";
  }
  if (parent.terrain === "forest") {
    return (row + col + parent.row) % 11 === 0 ? "flower" : noise > -0.15 ? "forest" : "grass";
  }
  if (parent.terrain === "mountain") {
    return (row * 3 + col + parent.col) % 7 === 0 ? "rock" : noise > 0.25 ? "grass" : "sand";
  }
  if (parent.terrain === "village") {
    if ((Math.abs(row - 6) <= 1 && Math.abs(col - 6) <= 1) || (Math.abs(row - 13) <= 1 && Math.abs(col - 14) <= 1)) {
      return "house";
    }
    return row === 10 || col === 10 ? "road" : "grass";
  }
  return (row + col + parent.col) % 17 === 0 ? "flower" : noise > 0.33 ? "forest" : "grass";
}

function isVillage(row: number, col: number, center: { row: number; col: number }) {
  return Math.abs(row - center.row) <= 4 && Math.abs(col - center.col) <= 5;
}

function islandFalloff(row: number, col: number, centerRow: number, centerCol: number, radiusRow: number, radiusCol: number) {
  const dr = (row - centerRow) / radiusRow;
  const dc = (col - centerCol) / radiusCol;
  return Math.max(0, 1 - Math.sqrt(dr * dr + dc * dc));
}

function wave(row: number, col: number) {
  return (Math.sin(row) + Math.cos(col) + Math.sin(row + col)) / 3;
}
