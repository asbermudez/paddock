---
"@paddock/web": minor
---

The browser tab now shows live status (#958). Its title gets a prefix — `● ` while a turn is running, `(2) ` for unread replies on a project or Home, and `✓ ` on a chat page when that chat is unread while you're on it in a background tab (a reply landed while you were in another tab, or you opened an already-unread chat in a background tab) — and the favicon gets a dot: orange while running, green for unread. A chat open in a background tab is no longer marked read until you actually look at it, so "finished while you were away" now registers in the sidebar and the fleet strip too; it is marked read the moment the tab is shown.
