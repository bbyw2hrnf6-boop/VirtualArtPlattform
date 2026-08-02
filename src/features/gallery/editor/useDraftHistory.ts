import { useCallback, useRef, useState } from 'react';

type DraftUpdater<T> = T | ((current: T) => T);

export function useDraftHistory<T>(initialValue: T, maximumEntries = 60) {
  const currentRef = useRef(initialValue);
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const lastGroupRef = useRef<{ key: string; changedAt: number } | null>(null);
  const [value, setValue] = useState(initialValue);
  const [timeline, setTimeline] = useState({ past: 0, future: 0 });

  const updateTimeline = useCallback(() => setTimeline({ past: pastRef.current.length, future: futureRef.current.length }), []);

  const commit = useCallback((updater: DraftUpdater<T>, group?: string) => {
    const previous = currentRef.current;
    const next = typeof updater === 'function' ? (updater as (current: T) => T)(previous) : updater;
    if (Object.is(previous, next)) return false;
    const now = Date.now();
    const grouped = Boolean(group && lastGroupRef.current?.key === group && now - lastGroupRef.current.changedAt < 800);
    if (!grouped) pastRef.current = [...pastRef.current.slice(-(maximumEntries - 1)), previous];
    futureRef.current = [];
    lastGroupRef.current = group ? { key: group, changedAt: now } : null;
    currentRef.current = next;
    setValue(next);
    updateTimeline();
    return true;
  }, [maximumEntries, updateTimeline]);

  const reset = useCallback((next: T) => {
    pastRef.current = [];
    futureRef.current = [];
    lastGroupRef.current = null;
    currentRef.current = next;
    setValue(next);
    updateTimeline();
  }, [updateTimeline]);

  const undo = useCallback(() => {
    const previous = pastRef.current.at(-1);
    if (previous === undefined) return false;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [currentRef.current, ...futureRef.current].slice(0, maximumEntries);
    lastGroupRef.current = null;
    currentRef.current = previous;
    setValue(previous);
    updateTimeline();
    return true;
  }, [maximumEntries, updateTimeline]);

  const redo = useCallback(() => {
    const next = futureRef.current[0];
    if (next === undefined) return false;
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current.slice(-(maximumEntries - 1)), currentRef.current];
    lastGroupRef.current = null;
    currentRef.current = next;
    setValue(next);
    updateTimeline();
    return true;
  }, [maximumEntries, updateTimeline]);

  return {
    value,
    current: currentRef,
    commit,
    reset,
    undo,
    redo,
    canUndo: timeline.past > 0,
    canRedo: timeline.future > 0
  };
}
