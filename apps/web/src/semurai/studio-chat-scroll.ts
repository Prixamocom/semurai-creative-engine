import { useCallback, useLayoutEffect, useRef, type UIEvent } from 'react';

/** Within this distance of the end the chat log keeps following new content. */
export const STUDIO_CHAT_STICK_PX = 80;

export function studioChatNearEnd(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= STUDIO_CHAT_STICK_PX;
}

function reducedMotion(): boolean {
  try { return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** Jumps to the newest message; `smooth` animates only when the user allows motion. */
export function scrollStudioChatToEnd(element: HTMLElement, smooth = false) {
  const top = element.scrollHeight;
  if (smooth && !reducedMotion() && typeof element.scrollTo === 'function') element.scrollTo({ top, behavior: 'smooth' });
  else element.scrollTop = top;
}

/**
 * "Stick to bottom" for the Studio chat log. The log jumps to the newest
 * message whenever the chat is shown again (after Comments or Edit, the log is
 * mounted anew) and after the user sends a request (`follow`). Streamed content
 * keeps the view at the end only while the user is already near it, so reading
 * older turns is never interrupted.
 */
export function useStudioChatScroll({ shown, revealed, jobs, live }: { shown: boolean; revealed: boolean; jobs: unknown; live: unknown }) {
  const log = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const smooth = useRef(false);
  const lastTop = useRef(0);
  useLayoutEffect(() => {
    const element = log.current;
    if (!shown || !element) return;
    following.current = true;
    scrollStudioChatToEnd(element);
    lastTop.current = element.scrollTop;
  }, [shown, revealed]);
  useLayoutEffect(() => {
    const element = log.current;
    if (!element || !following.current) return;
    scrollStudioChatToEnd(element, smooth.current);
    smooth.current = false;
  }, [jobs, live]);
  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    const element = event.currentTarget;
    const top = element.scrollTop;
    // Only the user scrolls up; a smooth scroll towards the end never unpins the log.
    if (studioChatNearEnd(element)) following.current = true;
    else if (top < lastTop.current) following.current = false;
    lastTop.current = top;
  }, []);
  /** The user sent a request: follow the log again and bring the new turn into view. */
  const follow = useCallback(() => {
    following.current = true; smooth.current = true;
    const element = log.current;
    if (element) scrollStudioChatToEnd(element, true);
  }, []);
  return { log, onScroll, follow };
}
