// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { Box, Paper } from "@mantine/core";
import { IconGripHorizontal } from "@tabler/icons-react";
import React from "react";
import { ViewerContext } from "../ViewerContext";
import GeneratedGuiContainer from "./Generated";

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

  const wrapperRef = React.useRef<HTMLDivElement>(null);

  // Minimal drag machinery, following the same approach as
  // `FloatingPanel.tsx`'s `dragHandler`/`dragInfo`, but scoped locally since
  // this panel doesn't need the shared expand/collapse/bounds-fixing
  // machinery that the main control panel does.
  const dragInfo = React.useRef({
    dragging: false,
    startPosX: 0,
    startPosY: 0,
    startClientX: 0,
    startClientY: 0,
  });

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
      panel!.style.left = `${state.startPosX + deltaX}px`;
      panel!.style.top = `${state.startPosY + deltaY}px`;
    }

    window.addEventListener(moveEventName, moveListener);
    window.addEventListener(
      endEventName,
      () => {
        window.removeEventListener(moveEventName, moveListener);
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
      radius="xs"
      shadow="0.1em 0 1em 0 rgba(0,0,0,0.1)"
      style={{
        boxSizing: "border-box",
        position: "absolute",
        top: "0.75em",
        left: "0.75em",
        zIndex: 10,
        minWidth: "16em",
        maxWidth: "20em",
        margin: 0,
        overflow: "hidden",
      }}
    >
      <Box
        style={{
          cursor: "grab",
          userSelect: "none",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "1.25em",
        }}
        onTouchStart={dragHandler}
        onMouseDown={dragHandler}
      >
        <IconGripHorizontal size="1em" stroke={1.5} opacity={0.5} />
      </Box>
      <Box px="xs" pb="xs">
        <GeneratedGuiContainer containerUuid={panelUuid} />
      </Box>
    </Paper>
  );
}
