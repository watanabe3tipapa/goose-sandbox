/* Gander — Goose language corner helpers.
   A tiny, pure model of the data stack used by the interactive panel.
   No DOM, no network, no storage. Usable from the browser and Node. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GanderGoose = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function formatBytes(bytes) {
    var n = Math.max(0, Number(bytes) || 0);
    if (n < 1024) return Math.round(n) + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function createStack() {
    return {
      used: 0,
      highWater: 0,
      released: 0,
      releases: 0,
      frames: []
    };
  }

  function enterScope(stack, name) {
    var frames = stack.frames.concat([{
      name: String(name || "scope"),
      mark: stack.used
    }]);
    return {
      used: stack.used,
      highWater: stack.highWater,
      released: stack.released,
      releases: stack.releases,
      frames: frames
    };
  }

  function pushBytes(stack, bytes) {
    var size = Math.max(0, Math.floor(Number(bytes) || 0));
    var used = stack.used + size;
    return {
      used: used,
      highWater: Math.max(stack.highWater, used),
      released: stack.released,
      releases: stack.releases,
      frames: stack.frames.slice()
    };
  }

  function leaveScope(stack) {
    if (!stack.frames.length) {
      return { stack: stack, released: 0, frame: null };
    }
    var frame = stack.frames[stack.frames.length - 1];
    var released = Math.max(0, stack.used - frame.mark);
    return {
      stack: {
        used: frame.mark,
        highWater: stack.highWater,
        released: stack.released + released,
        releases: stack.releases + 1,
        frames: stack.frames.slice(0, -1)
      },
      released: released,
      frame: frame
    };
  }

  function resetStack() {
    return createStack();
  }

  return {
    formatBytes: formatBytes,
    createStack: createStack,
    enterScope: enterScope,
    pushBytes: pushBytes,
    leaveScope: leaveScope,
    resetStack: resetStack
  };
});
