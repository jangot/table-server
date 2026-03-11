/**
 * Public contract for OBS scenes service (scene list, current scene, set scene).
 * Implementation is in scenes-service.ts and uses the WebSocket client.
 */

export interface ObsScenesService {
  getScenes(): Promise<string[]>;
  getCurrentScene(): Promise<string | null>;
  setScene(name: string): Promise<void>;
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
