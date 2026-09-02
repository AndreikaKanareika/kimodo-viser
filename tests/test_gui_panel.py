# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Anchored quick panels: emission, container semantics, inertness.

Inertness is the load-bearing test: the stock kimodo demo loads this same
package and client; its guarantee of unchanged behaviour rests on
'no add_panel call -> no GuiPanelMessage on the wire'.

Harness choice: `DummyWebsockInterface` (as used in test_timeline_prompts.py)
can't be used here because `GuiApi.__init__` does an `isinstance(owner,
ViserServer)` check to decide where to pull its websock interface from --
there's no seam for a dummy interface without reaching into private
attributes. `test_garbage_collection.py` establishes the alternative: a real
`viser.ViserServer()` (client autobuild mocked out) with messages observed via
`server._websock_server._broadcast_buffer.message_from_id`. That pattern is
used below.
"""

import viser
import viser._client_autobuild
from viser import _messages


def _panel_messages(server: viser.ViserServer) -> list[_messages.GuiPanelMessage]:
    buffer = server._websock_server._broadcast_buffer
    return [
        m for m in buffer.message_from_id.values() if isinstance(m, _messages.GuiPanelMessage)
    ]


def test_panel_message_shape() -> None:
    msg = _messages.GuiPanelMessage(
        uuid="p0",
        container_uuid="root",
        props=_messages.GuiPanelProps(order=0.0, anchor="top-left", visible=True),
    )
    assert msg.props.anchor == "top-left"


def test_add_panel_emits_message_and_acts_as_container() -> None:
    # Mock the client autobuild to avoid building the client.
    viser._client_autobuild.ensure_client_is_built = lambda: None
    server = viser.ViserServer()

    panel = server.gui.add_panel(anchor="top-left")

    messages = _panel_messages(server)
    assert len(messages) == 1
    assert messages[0].props.anchor == "top-left"
    assert messages[0].container_uuid == "root"
    assert messages[0].uuid == panel._impl.uuid

    with panel:
        button = server.gui.add_button("Go")
    assert button._impl.parent_container_id == panel._impl.uuid


def test_no_panel_no_message() -> None:
    # Mock the client autobuild to avoid building the client.
    viser._client_autobuild.ensure_client_is_built = lambda: None
    server = viser.ViserServer()

    server.gui.add_button("Go")
    with server.gui.add_folder("Some folder"):
        server.gui.add_button("Nested")

    assert _panel_messages(server) == []


def test_panel_remove_removes_children() -> None:
    viser._client_autobuild.ensure_client_is_built = lambda: None
    server = viser.ViserServer()

    buffer = server._websock_server._broadcast_buffer
    orig_len = len(buffer.message_from_id)

    panel = server.gui.add_panel(anchor="top-left")
    with panel:
        for i in range(10):
            server.gui.add_button(f"Button {i}")

    assert len(buffer.message_from_id) > orig_len
    panel.remove()
    server._run_garbage_collector(force=True)
    assert len(buffer.message_from_id) == orig_len
