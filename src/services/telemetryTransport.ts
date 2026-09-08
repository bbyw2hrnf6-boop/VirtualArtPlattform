import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from './firebase';
import type { TelemetryEvent } from './telemetry';

// Lazy-load the sender without retaining the entire Functions SDK namespace.
export async function sendTelemetry(events: readonly TelemetryEvent[]) {
  await httpsCallable(firebaseFunctions, 'recordLieuvaTelemetry')({ events });
}
