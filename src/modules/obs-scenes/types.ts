/**
 * Public contract for OBS scenes service (scene list, current scene, set scene).
 * Implementation is in scenes-service.ts and uses the WebSocket client.
 */

/** One entry from scenes config JSON (§5). */
export interface SceneConfigEntry {
  name: string;
  title?: string;
  type?: string;
  enabled?: boolean;
}

/** Scene for UI: name from OBS, optional title/type/enabled from config. */
export interface SceneForDisplay {
  name: string;
  title?: string;
  type?: string;
  enabled?: boolean;
}

export interface ObsScenesService {
  getScenes(): Promise<string[]>;
  getScenesForDisplay(): Promise<SceneForDisplay[]>;
  getCurrentScene(): Promise<string | null>;
  setScene(name: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

/** Thrown when setScene(name) is called with a scene name that does not exist in OBS. */
export class SceneNotFoundError extends Error {
  constructor(
    public readonly sceneName: string,
    message?: string
  ) {
    super(message ?? `Scene not found: ${sceneName}`);
    this.name = 'SceneNotFoundError';
    Object.setPrototypeOf(this, SceneNotFoundError.prototype);
  }
}
