import type { PhotoRef, SamplePhotoId } from '@/services/types';

export interface PhotoCaptureProps {
  /** Which on-screen guide to show. */
  guide: 'wide' | 'close' | 'before' | 'after';
  label: string;
  /** Sample picture offered in demo mode (e.g. no camera in a desktop browser). */
  sample: SamplePhotoId;
  onCaptured: (photo: PhotoRef) => void;
  variant?: 'primary' | 'secondary';
}
