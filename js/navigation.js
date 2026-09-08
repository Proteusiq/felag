const ENTERED = 'felag.entered';
const NAV_MAX = 'felag.navMax';

/** Browser-backed SPA history with desktop edges and mobile swipe gestures. */
export function createNavigation({
  welcome,
  edgeNav,
  backButton,
  forwardButton,
  routeKey,
  getView,
  isBlocked,
  restore,
  ignoreSwipe,
}) {
  let restoring = false;
  let index = Number(history.state?.felagIndex ?? 0);
  let max = Number(sessionStorage.getItem(NAV_MAX) ?? index);
  let swipe = null;

  const update = () => {
    const active = welcome.hidden && !isBlocked() && Boolean(getView()) && Boolean(history.state?.felagRoute);
    edgeNav.hidden = !active;
    backButton.disabled = !active || index <= 0;
    forwardButton.disabled = !active || index >= max;
  };

  const open = (route) => {
    if (!route) return false;
    restoring = true;
    try { return restore(route); }
    finally { restoring = false; update(); }
  };

  const checkpoint = (route) => {
    const key = routeKey();
    if (!route || !key) return update();
    sessionStorage.setItem(key, JSON.stringify(route));
    if (restoring) return update();

    const current = history.state?.felagRoute;
    if (JSON.stringify(current) === JSON.stringify(route)) return update();
    if (!current) {
      index = 0;
      max = 0;
      history.replaceState({ felagRoute: route, felagIndex: index }, '');
    } else {
      index = Number(history.state?.felagIndex ?? index) + 1;
      max = index;
      history.pushState({ felagRoute: route, felagIndex: index }, '');
    }
    sessionStorage.setItem(NAV_MAX, String(max));
    update();
  };

  const restoreSaved = () => {
    let route;
    try { route = JSON.parse(sessionStorage.getItem(routeKey()) ?? 'null'); }
    catch { route = null; }
    const restored = open(route);
    if (restored && !history.state?.felagRoute) {
      index = 0;
      max = 0;
      history.replaceState({ felagRoute: route, felagIndex: index }, '');
      sessionStorage.setItem(NAV_MAX, '0');
      update();
    }
    return restored;
  };

  backButton.addEventListener('click', () => history.back());
  forwardButton.addEventListener('click', () => history.forward());
  addEventListener('popstate', (event) => {
    if (!event.state?.felagRoute) return;
    index = Number(event.state.felagIndex ?? 0);
    open(event.state.felagRoute);
  });
  addEventListener('keydown', (event) => {
    if (!event.altKey || isBlocked()) return;
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      history.back();
    }
    if (event.key === 'ArrowRight' && index < max) {
      event.preventDefault();
      history.forward();
    }
  });
  addEventListener('touchstart', (event) => {
    if (!welcome.hidden || isBlocked() || event.touches.length !== 1 || ignoreSwipe(event.target)) return;
    const touch = event.touches[0];
    swipe = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  addEventListener('touchend', (event) => {
    if (!swipe || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const x = touch.clientX - swipe.x;
    const y = touch.clientY - swipe.y;
    swipe = null;
    if (Math.abs(x) < 90 || Math.abs(x) < Math.abs(y) * 1.4) return;
    if (x > 0 && index > 0) history.back();
    if (x < 0 && index < max) history.forward();
  }, { passive: true });

  return {
    checkpoint,
    restoreSaved,
    update,
    enter() { sessionStorage.setItem(ENTERED, 'true'); },
    entered() { return sessionStorage.getItem(ENTERED) === 'true'; },
    canBack() { return index > 0; },
    back() { if (index > 0) history.back(); },
  };
}
