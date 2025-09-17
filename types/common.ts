export type UUID = string;
export type ID = string | number;
export type Nullable<T> = T | null | undefined;

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export interface JSONObject { [k: string]: JSONValue; }
export type JSONArray = JSONValue[];

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export type Dictionary<T = unknown> = Record<string, T>;
export type UnknownRecord = Record<string, unknown>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type StepName = 'extract' | 'characters' | 'market' | 'pitch' | 'visuals' | 'assembly';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

