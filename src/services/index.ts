import { useAnnouncements } from '@/stores/announcements';
import { getScenarioEvents, getSimTime } from '@/stores/demo';

import { createMockServices } from './mock';
import type { Services } from './types';

/**
 * The single place that decides which implementation the app uses.
 * Swap in a Supabase/FastAPI implementation of `Services` here when the backend exists.
 */
export const services: Services = createMockServices({
  getSimTime,
  getEvents: getScenarioEvents,
  getAnnouncements: () => useAnnouncements.getState().items,
  addAnnouncement: (a) => useAnnouncements.getState().add(a),
});

export type * from './types';
