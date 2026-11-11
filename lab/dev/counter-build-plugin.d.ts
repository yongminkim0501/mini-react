import type { Plugin } from 'vite';
export function stripCounters(code: string, filename: string): { code: string; edits: number };
export function counterBuildPlugin(): Plugin;
