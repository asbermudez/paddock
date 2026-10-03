---
"@paddock/web": minor
---

The browser tab now shows live status (#958). Its title gets a prefix and the favicon a small dot — orange while a turn is running, green for something new:

- `● ` while a turn is running (this chat on a chat page; any chat in the project on a project page; anything on the instance on Home).
- `(2) ` on a project page or Home when replies landed while the tab was in the background. This counts only what is new since you last looked at that tab — not the whole unread backlog, which the sidebar and fleet strip still show — so a tab you are looking at never carries a count.
- `✓ ` on a chat page when that chat is unread while you're on it in a background tab: a reply landed while you were in another tab, or you opened an already-unread chat in a background tab.

A chat open in a background tab is no longer marked read until you actually look at it, so "finished while you were away" now registers in the sidebar and the fleet strip too; it is marked read the moment the tab is shown. An image logo that can't be drawn onto a canvas keeps showing as-is, with no dot; the title still carries the status.
