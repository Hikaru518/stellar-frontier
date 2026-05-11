export type MapRadiationLevel = "none" | "low" | "medium" | "high" | "critical";
export type MapSpecialStateSeverity = "low" | "medium" | "high" | "critical";
export type MapVisibility = "onDiscovered" | "onInvestigated" | "hidden";

export interface MapEnvironmentDefinition {
  temperatureCelsius: number;
  humidityPercent: number;
  magneticFieldMicroTesla: number;
  radiationLevel: MapRadiationLevel;
  toxicityLevel?: MapRadiationLevel;
  atmosphericPressureKpa?: number;
  notes?: string;
}

export interface MapSpecialStateDefinition {
  id: string;
  name: string;
  description?: string;
  visibility: MapVisibility;
  severity: MapSpecialStateSeverity;
  tags?: string[];
  dangerTags?: string[];
  startsActive: boolean;
  durationGameSeconds?: number;
}

export interface MapTileDefinition {
  id: string;
  row: number;
  col: number;
  areaName: string;
  terrain: string;
  weather: string;
  environment: MapEnvironmentDefinition;
  objectIds: string[];
  specialStates: MapSpecialStateDefinition[];
}

export type MapFeatureVisibility = "always" | MapVisibility;

export interface FeatureRowSpan {
  row: number;
  colStart: number;
  colEnd: number;
}

export interface FeatureFootprint {
  type: "row_spans";
  spans: FeatureRowSpan[];
}

export interface FeatureActionDefinition {
  id: string;
  category: "feature";
  label: string;
  tone?: string;
  conditions: unknown[];
  event_id?: string;
  display_when_unavailable?: "disabled";
  unavailable_hint?: string;
  local_action?: unknown;
}

export interface MapFeatureDefinition {
  id: string;
  name: string;
  description?: string;
  kind: string;
  priority: number;
  tags?: string[];
  visibility: MapFeatureVisibility;
  footprint: FeatureFootprint;
  investigatable?: boolean;
  status_options?: string[];
  initial_status?: string;
  actions?: FeatureActionDefinition[];
}

export type MapFeaturePatch = Partial<
  Pick<
    MapFeatureDefinition,
    "name" | "description" | "kind" | "priority" | "tags" | "visibility" | "investigatable" | "status_options" | "initial_status" | "actions"
  >
>;

export interface RadarWorldDefinition {
  width: number;
  height: number;
  origin: {
    x: number;
    y: number;
  };
}

export interface RadarSymbolDefinition {
  glyph: string;
  tone: string;
}

export type RadarRegionShapeDefinition =
  | { type: "circle"; x: number; y: number; radius: number }
  | { type: "box"; x1: number; y1: number; x2: number; y2: number };

export interface RadarRegionDefinition {
  id: string;
  label: string;
  priority: number;
  shape: RadarRegionShapeDefinition;
  tone: string;
}

export interface RadarTraceDefinition {
  layerNotice: string;
  controlMode: string;
  callMode: string;
  worldLine: string;
  jsonLine: string;
  emptyLine: string;
}

export interface RadarDefinition {
  world: RadarWorldDefinition;
  glyphRows: string[];
  toneRows: string[];
  palette: Record<string, string>;
  symbols: {
    crew: RadarSymbolDefinition;
    focus: RadarSymbolDefinition;
  };
  trace: RadarTraceDefinition;
  regions: RadarRegionDefinition[];
}

export interface MapEditorDraft {
  $schema?: string;
  id: string;
  name: string;
  version: number;
  size: {
    rows: number;
    cols: number;
  };
  originTileId: string;
  initialDiscoveredTileIds: string[];
  radarPath: string;
  tiles: MapTileDefinition[];
  features: MapFeatureDefinition[];
  radar: RadarDefinition;
}

export interface CreateMapDraftInput {
  id: string;
  name: string;
  rows: number;
  cols: number;
}

export interface TilePoint {
  row: number;
  col: number;
}

export interface MapEditorHistory {
  past: MapEditorDraft[];
  future: MapEditorDraft[];
}

export interface MapEditorState {
  draft: MapEditorDraft;
  history: MapEditorHistory;
}

export type SemanticBrush =
  | {
      kind: "terrain";
      value: string;
    }
  | {
      kind: "weather";
      value: string;
    }
  | {
      kind: "origin";
    }
  | {
      kind: "discovered";
      discovered: boolean;
    }
  | {
      kind: "radarGlyph";
      glyph: string;
    }
  | {
      kind: "radarTone";
      tone: string;
    };

export type MapEditorCommand =
  | {
      type: "gameplay/updateTile";
      tileId: string;
      patch: Partial<Pick<MapTileDefinition, "areaName" | "terrain" | "weather" | "environment" | "objectIds" | "specialStates">>;
    }
  | {
      type: "gameplay/setOrigin";
      tileId: string;
    }
  | {
      type: "gameplay/setDiscovered";
      tileId: string;
      discovered: boolean;
    }
  | {
      type: "gameplay/applySemanticBrush";
      tileId: string;
      brush: SemanticBrush;
    }
  | {
      type: "radar/updateCell";
      tileId: string;
      glyph?: string;
      tone?: string;
    }
  | {
      type: "feature/create";
      feature: MapFeatureDefinition;
    }
  | {
      type: "feature/update";
      featureId: string;
      patch: MapFeaturePatch;
    }
  | {
      type: "feature/delete";
      featureId: string;
    }
  | {
      type: "history/undo";
    }
  | {
      type: "history/redo";
    };
