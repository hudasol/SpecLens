// Every change to SpecLens is one appended event. Nothing else is stored.

export const EVENT_TYPES = Object.freeze([
  'intent_recorded',
  'interpretation_proposed',
  'draft_edited',
  'revision_created',
  'requirement_approved',
  'mapping_confirmed',
  'test_run_recorded',
  'app_repaired',
]);

export const eventId = (seq) => `EVT-${String(seq).padStart(4, '0')}`;
export const runId = (n) => `RUN-${String(n).padStart(4, '0')}`;

export function makeEvent({ seq, type, data, at, actor }) {
  if (!EVENT_TYPES.includes(type)) throw new Error(`Unknown event type: ${type}`);
  if (!Number.isInteger(seq) || seq < 1) throw new Error('Event sequence must be a positive whole number');
  return { seq, id: eventId(seq), type, at, actor, data };
}

// A stored log is only trusted when its sequence numbers run 1, 2, 3 and so on with known types.
export function validateLog(events) {
  if (!Array.isArray(events)) return 'The event log is not a list.';
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event || typeof event !== 'object') return `Event ${index + 1} is not an object.`;
    if (event.seq !== index + 1) return `Event ${index + 1} has sequence ${event.seq}.`;
    if (event.id !== eventId(index + 1)) return `Event ${index + 1} has identifier ${event.id}.`;
    if (!EVENT_TYPES.includes(event.type)) return `Event ${index + 1} has unknown type ${event.type}.`;
    if (typeof event.at !== 'string' || Number.isNaN(Date.parse(event.at))) {
      return `Event ${index + 1} has no valid time.`;
    }
  }
  return null;
}
