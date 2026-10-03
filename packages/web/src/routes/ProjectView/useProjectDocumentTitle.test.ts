import { describe, it, expect } from "vitest";
import { formatDocumentTitle } from "../../lib/documentTitle";
import { makeChat } from "../../test/factories";
import { projectTitleParts, type ProjectTitleInput } from "./useProjectDocumentTitle";

const base: ProjectTitleInput = {
  view: "home",
  root: false,
  brand: "House",
  workspaceName: "hushpod",
  activeSession: null,
  activeChat: null,
  pendingChat: null,
  loaded: true,
  filesSubpath: "",
};

/** The full title, with the issue's example brand. */
const title = (over: Partial<ProjectTitleInput>) =>
  formatDocumentTitle({ parts: projectTitleParts({ ...base, ...over }), brand: "House" });

describe("projectTitleParts (#958)", () => {
  it("home: the workspace", () => {
    expect(title({ view: "home" })).toBe("hushpod — House");
  });

  it("root home whose name is the brand is just the brand", () => {
    expect(title({ view: "home", root: true, workspaceName: "house" })).toBe("House");
  });

  it("chat: the chat's name, then the workspace", () => {
    const chat = makeChat({ sessionId: "s1", name: "Fix the leaking tap" });
    expect(title({ view: "chat", activeSession: "s1", activeChat: chat })).toBe(
      "Fix the leaking tap · hushpod — House",
    );
  });

  it("root chat when the root is named for the brand: no duplication", () => {
    const chat = makeChat({ sessionId: "s1", name: "Fix the leaking tap" });
    expect(
      title({ view: "chat", root: true, workspaceName: "House", activeSession: "s1", activeChat: chat }),
    ).toBe("Fix the leaking tap — House");
  });

  it("root named differently from the brand keeps its name", () => {
    expect(title({ view: "home", root: true, workspaceName: "projects" })).toBe("projects — House");
  });

  it("a PROJECT named like the brand keeps its name, so its chats differ from root chats", () => {
    const chat = makeChat({ sessionId: "s1", name: "Fix the leaking tap" });
    expect(
      title({ view: "chat", root: false, workspaceName: "house", activeSession: "s1", activeChat: chat }),
    ).toBe("Fix the leaking tap · house — House");
    expect(title({ view: "home", root: false, workspaceName: "HOUSE" })).toBe("HOUSE — House");
  });

  it("new, unsent chat", () => {
    expect(title({ view: "chat", activeSession: null })).toBe("New chat · hushpod — House");
  });

  it("a just-started chat with no list row yet reads as a new chat", () => {
    expect(title({ view: "chat", activeSession: "s9", pendingChat: "s9" })).toBe(
      "New chat · hushpod — House",
    );
  });

  it("while loading, a deep-linked chat shows the workspace alone — no placeholder", () => {
    expect(title({ view: "chat", activeSession: "s1", loaded: false })).toBe("hushpod — House");
  });

  it("an unknown chat id, once loaded, reads as a generic Chat", () => {
    expect(title({ view: "chat", activeSession: "nope", loaded: true })).toBe(
      "Chat · hushpod — House",
    );
  });

  it("a blank chat name falls back to Chat", () => {
    const chat = makeChat({ sessionId: "s1", name: "   " });
    expect(title({ view: "chat", activeSession: "s1", activeChat: chat })).toBe(
      "Chat · hushpod — House",
    );
  });

  it("a long chat name is truncated to 60 characters", () => {
    const chat = makeChat({ sessionId: "s1", name: "x".repeat(200) });
    expect(title({ view: "chat", activeSession: "s1", activeChat: chat })).toBe(
      `${"x".repeat(59)}… · hushpod — House`,
    );
  });

  it("files list, and an open file by basename", () => {
    expect(title({ view: "files" })).toBe("Files · hushpod — House");
    expect(title({ view: "files", filesSubpath: "src/feed.ts" })).toBe(
      "feed.ts · Files · hushpod — House",
    );
  });

  it("changes, with and without a file", () => {
    expect(title({ view: "changes" })).toBe("Changes · hushpod — House");
    expect(title({ view: "changes", changeFile: "lib/a.ts" })).toBe(
      "a.ts · Changes · hushpod — House",
    );
  });

  it("the remaining tabs", () => {
    expect(title({ view: "history" })).toBe("History · hushpod — House");
    expect(title({ view: "settings" })).toBe("Settings · hushpod — House");
    expect(title({ view: "triggers" })).toBe("Triggers · hushpod — House");
  });
});
