# Media placeholders

DevEco Studio's project template ships two binary icons that the module references but
that cannot be generated as text. Drop these in before building a signed HAP:

- `app_icon.png`  — app / ability icon (referenced by `$media:app_icon`)
- `startIcon.png` — splash icon (referenced by `$media:startIcon`)

Any DevEco "Empty Ability" template provides defaults you can copy here. The rest of the
project (ArkTS sources, configs, contracts) is complete and does not depend on these.
