/**
 * Navigation from outside React.
 *
 * Stores and socket handlers are plain modules and cannot call useNavigate.
 * A component inside the router (MeetProvider) registers the router's
 * navigate function here once, and non-component code navigates through it
 * — a client-side route change, not a reload. Before registration, or if
 * the router is ever gone, it falls back to a full navigation.
 */

type Navigator = (to: string) => void;

let navigator: Navigator | null = null;

export function registerNavigator(fn: Navigator | null): void {
  navigator = fn;
}

export function navigateTo(to: string): void {
  if (navigator) {
    navigator(to);
  } else {
    window.location.assign(to);
  }
}
