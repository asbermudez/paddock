import type { WhatsNewEntry } from "./types";
// The live What's New list: the twelve most recent entries from the website's
// What's New page, in the same order, newest first.
//
// Two constraints govern the writing here, both from #865/#866:
//
//  1. **Read in isolation, out of order.** The Home card shows exactly ONE
//     entry, chosen at random, with nothing around it. No entry may refer to
//     another, imply a position in a list, or assume the reader has seen the
//     one above it.
//  2. **Still true today.** An entry describes a release *as it shipped*, and
//     some are later superseded on the website, which carries forward-links for
//     them. The one line kept here is deliberately the part that is still true
//     in the current version — the website entry has the full history for anyone
//     who follows the link.
//
// Screenshots and videos stay on the website. The card has no room for them.
//
// Capped at 12 by `whats-new.test.ts`, which fails the build at 13. Adding an
// entry means bumping the oldest out of `whats-new.mdx` into
// `whats-new-archive.mdx` and deleting it from here. See #866.

// The sibling PR for #865 lands `./types.js` with these exact interfaces and
// will consolidate this declaration; it did not exist on main when this file
// was written.

/** Maximum live entries. Adding a thirteenth is a build failure — see #866. */
export const WHATS_NEW_MAX = 12;

const WHATS_NEW_PAGE = "https://paddock.edspencer.net/whats-new/";

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: "0-78-devbox-gpu",
    version: "0.78",
    title: "A real GPU for the devbox browser",
    body: "Map the host's render node into the devbox container and the browser agents drive gets hardware WebGL instead of a software renderer — measured 12.7× faster on 16× less CPU.",
    href: `${WHATS_NEW_PAGE}#078--a-real-gpu-for-the-devbox-browser`,
  },
  {
    id: "0-77-tabs-and-recent",
    version: "0.77",
    title: "Tabs you can tell apart, and chats that wait for you",
    body: "Browser tabs name the chat they show and carry a live status dot, and a chat that finished while you were away stays on the fleet strip until you read it.",
    href: `${WHATS_NEW_PAGE}#077--tabs-you-can-tell-apart-and-chats-that-wait-for-you`,
  },
  {
    id: "0-76-copy-download",
    version: "0.76",
    title: "Copy and Download on sent files",
    body: "Every file the agent sends has Copy and Download in its header — Copy takes the source, not the rendered page, and works while the file is collapsed.",
    href: `${WHATS_NEW_PAGE}#076--copy-and-download-on-sent-files`,
  },
  {
    id: "0-75-file-viewer",
    version: "0.75",
    title: "Sent files, full screen",
    body: "Any file the agent sent opens full screen from the ⛶ in its header, and ←/→ step through the chat's other sent files while the conversation scrolls along behind.",
    href: `${WHATS_NEW_PAGE}#075--sent-files-full-screen`,
  },
  {
    id: "0-74-4-fixes-and-header",
    version: "0.74.4",
    title: "A slimmer header, and a batch-mode security fix",
    body: "The project header is one row — the name, then its tabs — and on driveMode: batch, the tools Paddock injects into a turn are no longer reachable from the network.",
    href: `${WHATS_NEW_PAGE}#07410744--fixes-a-slimmer-header-and-a-batch-mode-security-fix`,
  },
  {
    id: "0-74-opus-5-5",
    version: "0.74",
    title: "Claude Opus 5.5, and delete from Settings",
    body: "Claude Opus 5.5 is the default model, newer and cheaper than Opus 5, and a project can be deleted from its Settings tab with a confirmation that says exactly what survives.",
    href: `${WHATS_NEW_PAGE}#074--claude-opus-55-and-delete-from-settings`,
  },
  {
    id: "0-73-long-chats",
    version: "0.73",
    title: "Long chats open fast",
    body: "A chat renders its most recent 500 messages, so one that has run for days opens quickly; nothing is deleted, and the cap is adjustable in Settings under Interface.",
    href: `${WHATS_NEW_PAGE}#073--long-chats-open-fast`,
  },
  {
    id: "0-72-1-shorter-migration",
    version: "0.72.1",
    title: "A shorter migration dialog",
    body: "The dialog that merges chats into ~/.claude says the same thing in 39% fewer words, with per-row explanations moved into tooltips.",
    href: `${WHATS_NEW_PAGE}#0721--a-shorter-migration-dialog`,
  },
  {
    id: "0-72-posture-profiles",
    version: "0.72",
    title: "One key for the whole posture",
    body: "One profile key — paranoid, balanced or yolo — sets an instance's security posture across the Claude sharing modes, spawn depth and capability toggles, without touching your port, bind address or auth.",
    href: `${WHATS_NEW_PAGE}#072--one-key-for-the-whole-posture`,
  },
  {
    id: "0-71-2-service-control",
    version: "0.71.2",
    title: "Service control",
    body: "An installed Paddock service restarts after any stop rather than only after a crash, and paddock service gained start, stop and restart, which wait for the URL to answer before claiming success.",
    href: `${WHATS_NEW_PAGE}#0712--service-control`,
  },
  {
    id: "0-71-1-front-door",
    version: "0.71.1",
    title: "The front door",
    body: "The root workspace's Home is the front door: Discovery sits inline while the instance is empty, and What's New and Tips cards each show one entry chosen at random.",
    href: `${WHATS_NEW_PAGE}#0711--the-front-door`,
  },
  {
    id: "0-71-0-stop-one-thing",
    version: "0.71.0",
    title: "Stop one thing, not everything",
    body: "Every row in the running-work bar has a ✕, and a Stop all appears once more than one thing is running — so a session with fifteen stray shells no longer has to be reaped whole.",
    href: `${WHATS_NEW_PAGE}#0710--stop-one-thing-not-everything`,
  },
];
