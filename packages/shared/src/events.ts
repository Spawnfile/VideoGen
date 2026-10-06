export interface UiEvent {
  id: number;
  ts: string;
  topic: string;
  type: string;
  payload: unknown;
}

export interface LiveEvent {
  topic: string;
  type: string;
  payload: unknown;
}
