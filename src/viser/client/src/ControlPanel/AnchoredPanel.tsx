// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { Box, Paper, Text, useMantineColorScheme } from "@mantine/core";
import { IconGripHorizontal } from "@tabler/icons-react";
import React from "react";
import { ViewerContext } from "../ViewerContext";
import GeneratedGuiContainer from "./Generated";

// Home (CSS-default) position, matching the parent Box's own padding
// convention elsewhere in the app.
const HOME_TOP = "0.75em";
const HOME_LEFT = "0.75em";

// Minimum gap (in px) kept between the panel and the edges of its
// positioned parent while dragging or re-clamping on resize.
const BOUNDARY_PAD = 8;

function storageKey(anchor: string) {
  return `viser-anchored-panel-${anchor}`;
}

/** Every localStorage access is wrapped in try/catch: storage can be
 * disabled, full, or simply absent (private browsing, embedded contexts,
 * etc), and failures here should never break the panel. */
function readStoredPosition(anchor: string): { x: number; y: number } | null {
  try {
    const raw = window.localStorage.getItem(storageKey(anchor));
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.x === "number" &&
      typeof parsed.y === "number"
    ) {
      return { x: parsed.x, y: parsed.y };
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoredPosition(anchor: string, x: number, y: number) {
  try {
    window.localStorage.setItem(storageKey(anchor), JSON.stringify({ x, y }));
  } catch {
    // Storage unavailable; the position simply won't persist.
  }
}

function clearStoredPosition(anchor: string) {
  try {
    window.localStorage.removeItem(storageKey(anchor));
  } catch {
    // Nothing to do if storage is unavailable.
  }
}

/**
 * Renders one server-defined "quick panel": a small GUI panel anchored to a
 * screen corner, independent of the main control panel.
 *
 * This only ever exists when a `GuiPanelMessage` has arrived from the
 * server, so stock viser sessions (which never send one) are unaffected.
 */
export default function AnchoredPanel({ panelUuid }: { panelUuid: string }) {
  const viewer = React.useContext(ViewerContext)!;
  const conf = viewer.useGui((state) => state.guiConfigFromUuid[panelUuid]);

  // Reuse the main control panel's width convention (small/medium/large ->
  // a fixed em value), rather than inventing a new magic number. See
  // `ControlPanel.tsx`'s `controlWidth` for the same computation.
  const controlWidthString = viewer.useGui(
    (state) => state.theme.control_width,
  );
  const controlWidth = (
    controlWidthString == "small"
      ? "16em"
      : controlWidthString == "medium"
        ? "20em"
        : controlWidthString == "large"
          ? "24em"
          : null
  )!;

  // Dark-mode awareness, following the same `useMantineColorScheme` check
  // used by `SidebarPanel.tsx` for its surfaces.
  const isDark = useMantineColorScheme().colorScheme == "dark";

  const wrapperRef = React.useRef<HTMLDivElement>(null);

  // Only "top-left" is implemented; unknown anchors fall back to it. This
  // string (not the panel uuid, which is server-assigned per session) is
  // what we key persisted positions on, so a reload finds them again.
  const anchor =
    conf?.type === "GuiPanelMessage" && conf.props.anchor === "top-left"
      ? conf.props.anchor
      : "top-left";

  // Minimal drag machinery, following the same approach as
  // `FloatingPanel.tsx`'s `dragHandler`/`dragInfo`, but scoped locally since
  // this panel doesn't need the shared expand/collapse machinery that the
  // main control panel does. Bounds-clamping is modeled on FloatingPanel's
  // `setPanelLocation`, simplified since this panel only ever anchors to a
  // single corner (top-left).
  const dragInfo = React.useRef({
    dragging: false,
    startPosX: 0,
    startPosY: 0,
    startClientX: 0,
    startClientY: 0,
  });

  // Clamp a candidate [x, y] so the panel stays fully inside its positioned
  // parent, and apply it to the DOM. Returns the clamped position actually
  // used.
  const applyClampedPosition = React.useCallback(
    (x: number, y: number): [number, number] => {
      const panel = wrapperRef.current;
      const parent = panel?.parentElement;
      if (!panel || !parent) return [x, y];

      const maxX = Math.max(
        BOUNDARY_PAD,
        parent.clientWidth - panel.clientWidth - BOUNDARY_PAD,
      );
      const maxY = Math.max(
        BOUNDARY_PAD,
        parent.clientHeight - panel.clientHeight - BOUNDARY_PAD,
      );
      const clampedX = Math.min(Math.max(x, BOUNDARY_PAD), maxX);
      const clampedY = Math.min(Math.max(y, BOUNDARY_PAD), maxY);

      panel.style.left = `${clampedX}px`;
      panel.style.top = `${clampedY}px`;

      return [clampedX, clampedY];
    },
    [],
  );

  const snapHome = React.useCallback(() => {
    const panel = wrapperRef.current;
    if (panel !== null) {
      panel.style.top = HOME_TOP;
      panel.style.left = HOME_LEFT;
    }
    clearStoredPosition(anchor);
  }, [anchor]);

  // Restore a persisted position (clamped to current bounds) on mount. Any
  // storage failure, or simply no stored value, leaves the panel at its
  // CSS-default home position.
  React.useEffect(() => {
    const stored = readStoredPosition(anchor);
    if (stored === null) return;
    applyClampedPosition(stored.x, stored.y);
  }, [anchor, applyClampedPosition]);

  // Re-clamp on resize, so the panel is never left in an unreachable
  // position (e.g. off-screen after the window shrinks).
  React.useEffect(() => {
    const panel = wrapperRef.current;
    const parent = panel?.parentElement;
    if (!panel || !parent) return;

    const observer = new ResizeObserver(() => {
      applyClampedPosition(panel.offsetLeft, panel.offsetTop);
    });
    observer.observe(panel);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [applyClampedPosition]);

  const dragHandler = (
    event:
      | React.TouchEvent<HTMLDivElement>
      | React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    const state = dragInfo.current;
    const panel = wrapperRef.current;
    if (panel === null) return;

    const isTouch = event.type === "touchstart";
    const startClientX = isTouch
      ? (event as React.TouchEvent<HTMLDivElement>).touches[0].clientX
      : (event as React.MouseEvent<HTMLDivElement>).clientX;
    const startClientY = isTouch
      ? (event as React.TouchEvent<HTMLDivElement>).touches[0].clientY
      : (event as React.MouseEvent<HTMLDivElement>).clientY;

    state.startClientX = startClientX;
    state.startClientY = startClientY;
    state.startPosX = panel.offsetLeft;
    state.startPosY = panel.offsetTop;

    const moveEventName = isTouch ? "touchmove" : "mousemove";
    const endEventName = isTouch ? "touchend" : "mouseup";

    function moveListener(moveEvent: MouseEvent | TouchEvent) {
      const clientX =
        "touches" in moveEvent
          ? moveEvent.touches[0].clientX
          : moveEvent.clientX;
      const clientY =
        "touches" in moveEvent
          ? moveEvent.touches[0].clientY
          : moveEvent.clientY;
      const deltaX = clientX - state.startClientX;
      const deltaY = clientY - state.startClientY;

      // Minimum motion before we consider this a drag (as opposed to a
      // click/tap).
      if (!state.dragging && Math.abs(deltaX) <= 3 && Math.abs(deltaY) <= 3)
        return;

      state.dragging = true;
      applyClampedPosition(state.startPosX + deltaX, state.startPosY + deltaY);
    }

    window.addEventListener(moveEventName, moveListener);
    window.addEventListener(
      endEventName,
      () => {
        window.removeEventListener(moveEventName, moveListener);
        if (state.dragging) {
          const draggedPanel = wrapperRef.current;
          if (draggedPanel !== null) {
            writeStoredPosition(
              anchor,
              draggedPanel.offsetLeft,
              draggedPanel.offsetTop,
            );
          }
        }
        // Clear the dragging flag on a delay, so that a trailing click
        // event (fired right after mouseup) doesn't do anything unwanted.
        window.setTimeout(() => {
          state.dragging = false;
        }, 0);
      },
      { once: true },
    );
  };

  if (conf === undefined || conf.type !== "GuiPanelMessage") return null;
  if (!conf.props.visible) return null;

  // Only "top-left" is implemented; unknown anchors fall back to it.
  return (
    <Paper
      ref={wrapperRef}
      radius="md"
      shadow="0 0.5em 1.5em 0 rgba(0,0,0,0.25)"
      style={{
        boxSizing: "border-box",
        position: "absolute",
        top: HOME_TOP,
        left: HOME_LEFT,
        zIndex: 10,
        width: controlWidth,
        margin: 0,
        overflow: "hidden",
        backgroundColor: isDark
          ? "rgba(30, 30, 30, 0.75)"
          : "rgba(255, 255, 255, 0.75)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <Box
        style={{
          cursor: "grab",
          userSelect: "none",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "0.4em",
          height: "1.75em",
          borderBottom: `1px solid ${
            isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"
          }`,
        }}
        onTouchStart={dragHandler}
        onMouseDown={dragHandler}
        onDoubleClick={snapHome}
      >
        <IconGripHorizontal size="1em" stroke={1.5} opacity={0.5} />
        <Text
          size="xs"
          fw={600}
          opacity={0.6}
          style={{ letterSpacing: "0.02em" }}
        >
          Kimodo
        </Text>
      </Box>
      <Box px="xs" pb="xs">
        <GeneratedGuiContainer containerUuid={panelUuid} />
      </Box>
    </Paper>
  );
}
