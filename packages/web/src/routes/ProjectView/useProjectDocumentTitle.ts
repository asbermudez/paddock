import type { Chat, Project } from "../../lib/types";
import { useProjects } from "../../lib/projects-context";
import { sameTitleName, useDocumentTitle, type TitlePart } from "../../lib/documentTitle";
import { getBrand } from "../../lib/brand";
import type { ProjectViewTab } from "./urls";

/**
 * The document title for every route `ProjectView` serves (#958):
 *
 *   home      `hushpod`
 *   chat      `Fix the leaking tap · hushpod` (a new, unsent chat: `New chat · hushpod`)
 *   files     `feed.ts · Files · hushpod` (bare `Files · hushpod` on the list)
 *   changes   `feed.ts · Changes · hushpod`
 *   other     `History · hushpod`, `Settings · hushpod`, `Triggers · hushpod`
 *
 * — each followed by ` — <brand>` (see `formatDocumentTitle`). The root
 * workspace's name stands in for the project's, and is dropped when it equals the
 * brand, so root Home on an instance named after its directory is just the brand.
 * A PROJECT that shares the brand's name keeps it (`X · paddock — Paddock`), or
 * its chats would be indistinguishable from root chats.
 */
export interface ProjectTitleInput {
  view: ProjectViewTab;
  /** Is this the ROOT workspace? Only the root's name is dropped when it is the brand. */
  root: boolean;
  /** The instance brand name, for that comparison. */
  brand: string;
  /**
   * The workspace's display name, best available: the loaded project's name,
   * else the sidebar's cached copy, else (for a project) its slug. Never
   * empty for a project; may be empty for the root before anything has loaded.
   */
  workspaceName: string;
  /** The open chat's session id; null on a fresh "new chat". */
  activeSession: string | null;
  /**
   * The open chat's DTO if known — the same row the sidebar labels it with, so
   * the tab and the sidebar can never disagree about a chat's name.
   */
  activeChat: Chat | null;
  /** A just-started chat that has an id but no list row yet. */
  pendingChat: string | null;
  /** Whether the workspace detail (and so its chat list) has loaded. */
  loaded: boolean;
  /** The files-tab subpath ("" = the list). */
  filesSubpath: string;
  /** The changes-tab file, if one is deep-linked. */
  changeFile?: string;
}

const TAB_LABEL: Record<Exclude<ProjectViewTab, "home" | "chat">, string> = {
  files: "Files",
  changes: "Changes",
  history: "History",
  settings: "Settings",
  triggers: "Triggers",
};

function basename(path: string | undefined): string {
  if (!path) return "";
  const segs = path.split("/").filter(Boolean);
  return segs[segs.length - 1] ?? "";
}

/** The chat's segment of the title — null while it can't be known yet. */
function chatPart(input: ProjectTitleInput): TitlePart {
  const { activeSession, activeChat, pendingChat, loaded } = input;
  if (activeSession === null) return "New chat";
  // A blank name (never expected, but the field is free text) still says "Chat"
  // rather than collapsing the title to just the workspace.
  if (activeChat) return activeChat.name.trim() ? activeChat.name : "Chat";
  if (pendingChat === activeSession) return "New chat";
  // Still loading: show the workspace alone rather than a guess.
  if (!loaded) return null;
  // Loaded, and the id is in no list (a stale link, a deleted chat).
  return "Chat";
}

export function projectTitleParts(input: ProjectTitleInput): TitlePart[] {
  const { view, root, brand } = input;
  const workspaceName =
    root && sameTitleName(input.workspaceName, brand) ? "" : input.workspaceName;
  switch (view) {
    case "home":
      return [workspaceName];
    case "chat":
      return [chatPart(input), workspaceName];
    case "files":
      return [basename(input.filesSubpath), TAB_LABEL.files, workspaceName];
    case "changes":
      return [basename(input.changeFile), TAB_LABEL.changes, workspaceName];
    default:
      return [TAB_LABEL[view], workspaceName];
  }
}

/** What `ProjectView` hands over — raw state; the resolving happens here. */
export interface ProjectDocumentTitleState
  extends Omit<ProjectTitleInput, "workspaceName" | "activeChat" | "loaded" | "brand"> {
  slug: string;
  project: Project | null;
  chats: readonly Chat[];
  /** The #154 last-seen copy of the open chat, for when it drops out of `chats`. */
  lastActiveChat: Chat | null;
}

export function useProjectDocumentTitle(state: ProjectDocumentTitleState): void {
  const { projects, rootWorkspace } = useProjects();
  const { root, slug, project, chats, lastActiveChat, activeSession } = state;
  // Best available name: the loaded detail, else the sidebar's cached copy
  // (present before the detail lands), else the slug itself.
  const cached = root ? rootWorkspace : projects.find((p) => p.slug === slug);
  const workspaceName = project?.name ?? cached?.name ?? slug;
  const activeChat =
    chats.find((c) => c.sessionId === activeSession) ??
    (lastActiveChat?.sessionId === activeSession ? lastActiveChat : null);
  useDocumentTitle(
    projectTitleParts({
      ...state,
      workspaceName,
      activeChat,
      loaded: project !== null,
      brand: getBrand().name,
    }),
  );
}
