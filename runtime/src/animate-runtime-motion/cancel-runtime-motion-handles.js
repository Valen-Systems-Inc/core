export function createRuntimeMotionHandleRegistry() {
  const handles = new Set();
  return {
    add(handle) {
      if (handle) handles.add(handle);
      return handle;
    },
    cancelAll() {
      handles.forEach((handle) => {
        if (typeof handle === "number") {
          window.cancelAnimationFrame?.(handle);
          window.clearTimeout?.(handle);
          return;
        }
        if (typeof handle?.cancel === "function") handle.cancel();
        else if (typeof handle?.pause === "function") handle.pause();
      });
      handles.clear();
    },
    delete(handle) {
      handles.delete(handle);
    },
    get size() {
      return handles.size;
    }
  };
}
