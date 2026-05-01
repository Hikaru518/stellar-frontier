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

export interface MapVisualCellDefinition {
  tilesetId: string;
  tileIndex: number;
}

export interface MapVisualLayerDefinition {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  cells: Record<string, MapVisualCellDefinition>;
}

export interface MapVisualDefinition {
  layers: MapVisualLayerDefinition[];
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
  tiles: MapTileDefinition[];
  visual: MapVisualDefinition;
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
  activeLayerId: string | null;
  history: MapEditorHistory;
}

export type VisualPaintTool = "brush" | "eraser" | "bucketFill" | "rectangleFill";

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
    };

export type MapEditorCommand =
  | {
      type: "visual/brush";
      tileId: string;
      cell: MapVisualCellDefinition;
    }
  | {
      type: "visual/eraser";
      tileId: string;
    }
  | {
      type: "visual/bucketFill";
      tileId: string;
      cell: MapVisualCellDefinition;
    }
  | {
      type: "visual/rectangleFill";
      fromTileId: string;
      toTileId: string;
      cell: MapVisualCellDefinition;
    }
  | {
      type: "layer/setActive";
      layerId: string | null;
    }
  | {
      type: "layer/add";
      layer: MapVisualLayerDefinition;
    }
  | {
      type: "layer/rename";
      layerId: string;
      name: string;
    }
  | {
      type: "layer/move";
      layerId: string;
      direction: "up" | "down";
    }
  | {
      type: "layer/delete";
      layerId: string;
    }
  | {
      type: "layer/setVisible";
      layerId: string;
      visible: boolean;
    }
  | {
      type: "layer/setLocked";
      layerId: string;
      locked: boolean;
    }
  | {
      type: "layer/setOpacity";
      layerId: string;
      opacity: number;
    }
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
      type: "history/undo";
    }
  | {
      type: "history/redo";
    };
