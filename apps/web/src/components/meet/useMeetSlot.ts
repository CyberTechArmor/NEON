import { useLayoutEffect, useRef } from 'react';
import { useMeetStore } from '../../stores/meet';

/**
 * Marks an element as the place the persistent MEET iframe should appear.
 *
 * The iframe itself is rendered once, at the app root (MeetFrame), and moved
 * over whichever slot is mounted. That is what lets the call change shape —
 * embedded, PiP, fullscreen, a mobile mini view — without the iframe ever
 * being re-created; an iframe that is unmounted, or re-parented, reloads,
 * and a reload is a disconnect (and the end of any screen share).
 *
 * The rect is re-read after every render of the owning component (a dragged
 * PiP re-renders on each mouse move), on size changes, and on window resize
 * and scroll. On unmount the slot is cleared, which hides the frame but keeps
 * it alive.
 */
export function useMeetSlot<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const setSlot = useMeetStore((state) => state.setSlot);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      // This render has no slot element (e.g. the chrome switched to its
      // minimized branch without unmounting): hide the frame.
      setSlot(null);
      return;
    }

    const measure = () => {
      const r = element.getBoundingClientRect();
      setSlot({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  });

  useLayoutEffect(() => {
    return () => setSlot(null);
  }, [setSlot]);

  return ref;
}
