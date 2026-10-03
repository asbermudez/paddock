---
"@paddock/web": minor
---

Browser tabs now say what they are showing instead of just the instance name. A chat's tab reads `Fix the leaking tap · hushpod — Paddock`, a project's Home `hushpod — Paddock`, its other tabs `Files · hushpod — Paddock` (with the open file's name first when there is one), a new chat `New chat · hushpod — Paddock`, and Discover, Config and tag pages `Discover — Paddock`, `Config — Paddock` and `#infra — Paddock`. The title follows a rename, and a new chat picks up its name as soon as it gets one. Long chat names are cut at about 60 characters, and the root workspace's name is left out when it matches the instance name. The page the server sends still carries only the instance name.
