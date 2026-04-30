import type { PhaserMapSceneState } from "./PhaserMapCanvas";

interface SceneStateRef {
  current: PhaserMapSceneState;
}

export class MapScene {
  readonly key = "MapScene";

  constructor(private readonly stateRef: SceneStateRef) {}

  getState(): PhaserMapSceneState {
    return this.stateRef.current;
  }

  updateState(nextState: PhaserMapSceneState): void {
    this.stateRef.current = nextState;
  }
}
