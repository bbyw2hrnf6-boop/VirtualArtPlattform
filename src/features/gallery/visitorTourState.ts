export type VisitorTourStatus = "idle" | "playing" | "paused";

export type VisitorTourState = {
  status: VisitorTourStatus;
  progress: number;
  currentLabel: string;
  currentStop: number;
  stopCount: number;
};

export const IDLE_VISITOR_TOUR: VisitorTourState = {
  status: "idle",
  progress: 0,
  currentLabel: "Ready when you are",
  currentStop: 0,
  stopCount: 0,
};
