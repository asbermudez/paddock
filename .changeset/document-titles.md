---
"@paddock/web": minor
---

Browser tabs now say what they are showing instead of just the instance name. A chat's tab reads `Fix the leaking tap · hushpod — Paddock`, a project's Home `hushpod — Paddock`, its other tabs `Files · hushpod — Paddock` (with the open file's name first when there is one), a new chat `New chat · hushpod — Paddock`, and Discover, Config and tag pages `Discover — Paddock`, `Config — Paddock` and `#infra — Paddock`. The root workspace's pages leave its name out, since the instance name already says where you are: `/` is just `Paddock`, and a root chat reads `Fix the leaking tap — Paddock`. The title follows a rename, and a new chat picks up its name as soon as it gets one. Long chat names are cut at about 60 characters. The page the server sends still carries only the instance name.
