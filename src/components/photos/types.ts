import type { PhotoRef, SamplePhotoId } from '@/services/types';

export interface PhotoCaptureProps {
  /** Which on-screen guide to show. */
  guide: 'wide' | 'close' | 'before' | 'after';
  label: string;
  /** Sample picture offered in demo mode (e.g. no camera in a desktop browser). */
  sample: SamplePhotoId;
  onCaptured: (photo: PhotoRef) => void;
  variant?: 'primary' | 'secondary';
  /**
   * Web has no camera screen to show the guide on, so it is written above the button. Set false
   * when the screen already says it (the report wizard's empty viewfinder).
   */
  showGuide?: boolean;
}
