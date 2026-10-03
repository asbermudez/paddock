---
"@paddock/web": minor
"@paddock/server": patch
---

The browser-tab icon is now the instance's brand chip: its logo (an emoji, a letter, or an image) on a rounded square in its accent colour, so tabs from different instances can be told apart. An instance that leaves the accent at the default but has been renamed gets a colour derived from its name, and the sidebar logo chip uses the same colour so tab and chip match. That identity colour wins over the per-browser accent picked in Config → Appearance for the chip only; the rest of the UI keeps the theme's (or your chosen) accent. An instance with every branding value at its default keeps the stock horse icon. An image logo the browser can't draw onto a canvas (a cross-origin URL without CORS headers) is used as the tab icon as-is, and one that doesn't load falls back to the name's first letter. Config → Branding now says that the logo and accent are what tell this instance's tabs apart.
