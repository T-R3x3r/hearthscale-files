# Developing Files

`README.md` is the text the Marketplace shows under **About** on the listing of Files, so it is written for the people who install it. This file is for the people who work on it.

Files is an ordinary Hearthscale app. Nothing in the platform knows its
name; it installs from the Marketplace like any other app.

## Working on it

With a Hearthscale platform running on this machine:

```sh
hearthscale dev .
```

links this folder into the running platform, picks up every change, and
asks once in the window before any code runs.

## The view

Files shows one view, `files`, which fills its tab: the tree of a folder
on the right and a preview of the picked file on the left. Its source is
React under `ui/src`, drawn with the `hs-*` classes and `ri-*` icons of
the kit that Hearthscale loads into every view. Its build writes
`views/files.js`, the one file the package carries for it, so the file is
committed with every change to the source:

```sh
cd ui
pnpm install
pnpm build
```

The view reaches the platform only through the extensions `uses` names:
`roots` for the folders the person gave the app, the pick of another one,
and the reads inside them (`hearthscale/fs/list`, `read`, `raw` and
`icon`), each confined by the platform to those folders; `files.open` to
open a file in the system's app. "Add to chat" puts a file on the chats
on screen as a removable chip, through `ui/update-model-context`.

The view `shows` files: a file a turn changed outside a git repository
opens here, on the address `/?path=<absolute path>`, which the view reads
as `openai/deepLink`. It shows the file's folder with the file selected
and its preview; Hearthscale gives the app that folder before it opens
the view.

## Traps

- The view's document is framed with an opaque origin, which starts no
  module worker: the PDF worker is bundled into the view as a classic
  worker (`?worker&inline`), and pdf.js fetches nothing.
- Nothing reaches the network, so pdf.js draws a font a PDF does not embed
  with the system's own, and Mermaid and Vega draw with no `eval`
  (`securityLevel: 'strict'`, `vega-interpreter`).
- `ui/pnpm-workspace.yaml` keeps the build its own project: without it,
  pnpm joins any workspace in a folder above.

## Releasing

Install the Hearthscale registry's GitHub App on this repository once. Then
every release whose tag equals `version` in `app.json` is picked up by the
Marketplace.

```sh
hearthscale pack .
```

builds the package to attach to the release.

## Licence

MIT. See `LICENSE`.
