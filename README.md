# Proof DyLean

A local fork of `../browsable-dylean` with an expandable viewer for **actual compiled Lean proof terms**.

The site's home page, **[dist/index.html](dist/index.html)**, links to the four ways of reading the proof: the guided walkthrough, the proof toolkit, the compiled proof tree, and the source browser (now at `source.html`). Open **[dist/proof.html](dist/proof.html)** directly, or visit `http://localhost:4174/` after running:

```sh
python3 -m http.server 4174 --bind 127.0.0.1 --directory dist
```

Start at Signed DH’s `client_secrecy`. The **Lean / Plain English** toggle switches between Lean proof-term previews and added explanations, preserving your expanded branches. Lean is the default. Names and types such as `client : DY.Participant` are shown openly at each `fun` step; there is no hidden binder box. “The statement we're proving” is the theorem’s proposition, while the pane on the right shows the source including its tactic script. Expand ▸ to inspect introductions, intermediate terms, lemma applications, and eliminators. Open referenced lemma bodies inline; every application argument remains available, including implicit/typeclass arguments in separate disclosures. Open Details on a term to see its lexical context and, when recoverable directly from its parent binder, its expected type. Click a named constant to navigate the source pane without closing the tree. Local variables jump to their introduction in the tree. The adjacent source browser has its own Back/Forward controls.

**Guided walkthrough.** [dist/walkthrough.html](dist/walkthrough.html) explains the same `client_secrecy` proof one step per screen, with no page scrolling: a visual on the left (statement, goal states, the unfolded event invariant, the attacker-knowledge chain), the narration transcript on the right with word-level highlighting, and the tactic script showing where you are. Arrow keys move between steps, space plays or pauses, and auto-advance plays the whole thing through in about five minutes. While the narration plays, the element it is describing is spotlit and the rest of the slide dims; `data-cue="phrase|other phrase"` on an element names the narration phrases that trigger it, and the tests check every phrase exists. Each step links to its source line and the last step maps tactics to rows of the compiled proof tree. The walkthrough explains the proof at the level of the tactic script plus the two library lemmas the automation relies on; the compiled tree page shows the same argument with `simp`/`grind` expanded. The voice-over is a cloned voice generated with ElevenLabs from `web/walkthrough/script.json` by `python3 scripts/narrate.py` (needs `ELEVENLABS_API_KEY`, or `--env-file`), which writes `web/walkthrough/audio/*.mp3` and `web/walkthrough/narration.js` with per-word timings and only regenerates steps whose text changed. A `pronounce` map respells names for the voice while the transcript keeps the written form. The narration is editorial, like the reading trail; the step visuals quote the actual theorem, lemma statements, and invariant definitions.

**Proof toolkit.** [dist/toolkit.html](dist/toolkit.html) answers "what is available to me when I write one of these proofs?". It is a curated table, grouped into the theorems, the reachability steps, the actions inside a step and their Hoare triples, the entry invariants you can read back from a trace, SignedDH's own invariant choices, the bytes rules, labels and corruption, and attacker knowledge. Each row says what you **must prove** to introduce it and what **you get** from it, and opens to the declaration's Lean source with every referenced name clickable. Clicking a name opens that declaration nested underneath, recursively, with cycles reported rather than reopened; library names outside the repository open in the source pane instead. A search box opens any of the repository's declarations the same way, and `#decl=Full.Name` deep-links to one. The data comes from `scripts/toolkit.py`, which the build runs after `data.js`: it exports every non-local repository declaration with its source span and compiler-resolved references, and resolves `web/toolkit/manifest.json`, whose entries name declarations exactly or, for hygienic instance names, by `file:line`. The build fails if a manifest entry no longer resolves.

**A real trace.** [dist/trace.html](dist/trace.html) shows the SignedDH sanity-check runs from `Examples/SignedDH/SanityChecks.lean`, executed in Lean by `scripts/ExportTrace.lean` (driven by `scripts/export_trace.py`, which the build runs unless `--skip-lean`). Each of the 15 entries of the honest run, and the 18 of the client-compromise run, appears inside the step that appended it, next to the action, its Hoare triple, the ghost label the spec chose, the entry invariant on the prefix, and what the attacker learns. Byte terms are rendered from their real structure, with serialised length prefixes collapsed and recurring terms named (`xSk`, `k`, …). The execution data is generated; `web/trace/annotations.json` is the editorial layer, and tests check that every entry is appended by exactly one annotated action of the right kind and that every linked declaration exists.

**Concept pages.** Four explainers share one layout (`web/explainer.css`, `web/explainer.js`) and embed the same nestable source cards as the toolkit: [hoare.html](dist/hoare.html) on Hoare triples, `WP.wp`, ghost arguments, the bind rule and the `step` tactic, with a stepper through `Client.initiate.spec`; [labels.html](dist/labels.html) on labels as corruption predicates, `canFlow`, `join`/`meet`, per-primitive label rules, usages and compromise, with an illustrative table that evaluates SignedDH's labels for chosen compromises; [state.html](dist/state.html) on global and local state, handles, state invariants, the per-state compromise label, and long-term keys; and [equations.html](dist/equations.html) on symbolic bytes, normalising smart constructors, attacker rules, per-primitive invariants as security assumptions, and adding a primitive. The home page lists them with the trace and `#combine` pages under "Concepts". `tests/test_explainers.py` checks that every embedded card and source link resolves.

**How #combine works.** [dist/combine.html](dist/combine.html) explains the macro that assembles a protocol's modular pieces into the global types and instances DyLean's core expects: the à-la-carte construction it serves, what each of SignedDH's eight invocations generates (listed from the compiler's own attribution of declarations to the command's span), one invocation expanded by hand declaration by declaration, the syntax, the dispatch to per-mechanism `#combine_one` rules, the four helpers, a table of all seventeen rules, the two Lean issues worked around, and the recipe for adding a mechanism. It embeds the same nestable source cards as the toolkit (`web/cards.js`, `web/cards.css`), so the macro's own code can be unfolded in place. Tests check that every rule in the source is in the table and that the generated-declaration counts quoted in the prose match the export.

The six reading-trail entries connect the secrecy statement to reachable-trace induction, attacker-knowledge closure, hash/DH components, and `Client.finish.spec`. These explanations are editorial guidance; the tree is generated from Lean expressions. A helper body is expanded with its own fresh parameters, rather than substituted/normalized into its caller. Constructors, recursors and axioms are explicitly marked as boundaries; repeated declarations on an expansion path stop cycles. The exporter includes the complete transitive **term and type** dependency closure of its seed declarations, including generated `simp`/`grind` proof helpers. Other declarations in the repository are still available in the source browser; they are not necessarily in this proof export.

The initial snapshot has 9,529 declarations and 463,756 expression nodes. Nodes are deduplicated and loaded in 2,048-node classic-script chunks so the initial page does not download the whole graph. This works over HTTP and `file://`, with no backend or CDN. Source ranges come from Lean’s compiler, including library sources and an explicitly labelled enclosing-declaration fallback for helpers with no range. Generated proof anchors are not overlaid onto source identifiers.

**Printed proof** downloads use Lean’s pretty printer with `pp.proofs true`, `pp.deepTerms true`, and a high `pp.maxSteps`. The fully explicit secrecy download additionally uses `pp.all true`. For comparison, you can print the theorem from Lean with:

```lean
import all Examples.SignedDH.SecurityTheorems
set_option pp.proofs true in
set_option pp.deepTerms true in
set_option pp.maxSteps 100000000 in
#print DY.Example.SignedDH.client_secrecy

set_option pp.all true in
set_option pp.maxSteps 100000000 in
#print DY.Example.SignedDH.client_secrecy
```

`#print` may reference generated helper lemmas by name. This viewer also exports their bodies. The graph is a compiled proof certificate, not the chronology or failed branches of tactic search. Structural text previews have a display budget and mark omitted portions with `…`; the expandable graph retains every kernel expression child and every constant’s universe levels. Non-semantic expression metadata is discarded. This viewer does not re-check proofs in the browser: the build first checks the source with the pinned Lean toolchain and then reads compiled declarations.

Why does the argument stop? DyLean defines attacker knowledge as a **least fixpoint**. Its theorem establishes that publishability is closed under every allowed attacker operation and includes the base knowledge. That single closure argument covers arbitrary chains of attacker operations. Reachable traces are handled by induction, and the protocol establishes invariants at each step. The proof does not recursively guess infinitely many possible ways a key was constructed.

To regenerate both pages, run `python3 scripts/build.py` (or `npm run build`). The proof export is cached by source content, toolchain, and exporter version. `--skip-lean` still requires fresh compiler indexes. To change the starting proofs, edit `seeds` in `scripts/ExportProofs.lean`; the build discovers their dependencies and source files automatically. `dist/build-info.json` identifies the source snapshot. `npm test` checks graph closure, binder scope, source destinations, generated helper bodies, offline loading, UI expansion, local context, and source-browser navigation.

The existing source browser remains at **[dist/source.html](dist/source.html)**. The original source-browser documentation follows.

---


A mobile-friendly, fully static browser for the Lean code in `../dylean`.

**Open `dist/source.html` directly**, or serve `dist/` with any static web server. The generated snapshot is included. No backend, API, CDN, build tools, or Lean installation is required to browse it.

## Generate a fresh static website

Requires Python 3.9+ and [elan / Lake](https://github.com/leanprover/elan) on your PATH. Lake uses the source repository's pinned Lean toolchain. There are no Python packages or frontend runtime dependencies to install.

```sh
cd ../browsable-dylean
python3 scripts/build.py
# Equivalent: npm run build
```

The generator runs `lake build`, explicitly builds every repository module’s `.ilean` index, and runs `scripts/ExportReferences.lean` to collect local bindings and declaration ranges from elaboration. It then writes the complete website to `dist/`. Full reference extraction is cached in `.cache/` by repository content, toolchain, and extractor version; the first build takes longer. A Lean build failure stops the export. It doesn't edit Lean source files, but Lake updates the source repo's ignored `.lake` build cache.

Options:

```sh
python3 scripts/build.py --source /path/to/dylean --out /path/to/site
python3 scripts/build.py --skip-lean  # reuse existing indexes; rejects missing or older indexes
```

`--skip-lean` is a local speed shortcut with timestamp-based freshness checks. Use the default build for authoritative regeneration after source or toolchain changes. Build output records the source commit, content hash, and pinned toolchain in `dist/build-info.json`.

## Preview and publish

```sh
python3 -m http.server 4173 --directory dist
# Equivalent: npm run preview
```

Open <http://localhost:4173>. To preview on a phone on the same network, open `http://<your-computer-LAN-IP>:4173`; the preview command listens on all interfaces.

Upload **the contents of `dist/`** to any static host, including GitHub Pages, Netlify, Cloudflare Pages, or an ordinary web server. For a GitHub Pages branch deployment, copy those contents to the selected publishing directory. No SPA rewrites or server functions are needed. Asset paths are relative and routes use URL fragments, so subdirectory hosting and shared deep links work. HTTP compression on the host will further reduce the index transfer size.

The checked-in snapshot can be hosted immediately. To regenerate on a build service, provide the DyLean checkout and the pinned Lean toolchain, run the generator, and publish `dist/`.

## Navigation

- Tap a linked identifier to go to its resolved definition. Ambiguous source ranges offer a choice.
- Use the toolbar's Back / Forward or native browser history to return to your reading position.
- Tap line numbers to create links to exact source locations; Copy link shares the current view.
- Inspect **Callers**, **Callees**, and **References**. Expand branches to explore recursively; cycles are marked and stop expanding.
- Explore module imports and reverse imports in **Imports**.
- Search symbols, files, or source text. `/` opens search; Escape closes it.
- Use the file outline to jump between declarations, and Raw to download a source file.
- On mobile, switch between **Files**, **Code**, and **Inspect** in the fixed bottom bar. Long lines wrap by default; wrapping can be toggled. Controls are keyboard-accessible, dialogs retain native keyboard behavior, and tab groups support arrow keys.

## Accuracy and scope

The index combines **Lean compiler `.ilean` metadata (format version 5)** with compiler elaboration trees and declaration ranges, not textual name matching. This includes local variables, proof hypotheses, and declarations generated by macros such as `#combine`. Shadowed local variables retain separate identities. Generated declarations link to the compiler-recorded command that generates them. Definition positions and usage locations are zero-based UTF-16 internally, matching Lean's LSP data. The UI shows one-based line numbers.

In Lean, the caller graph is a **declaration dependency graph**: an edge means a declaration contains a resolved source reference to another declaration. Uses in types, proofs, and function implementations all count. It is not a runtime execution trace, and dependencies without compiler-recorded source references may be absent. References outside a declaration (for example, some attributes) appear in References without a caller edge.

The export includes all non-hidden `.lean` files in DyLean, plus the Lean / Std library source files defining symbols referenced by this repository. Library sources load on demand from relative static script files, including with `file://`. Symbol search includes indexed library declarations; source-text search covers DyLean. Imports to included modules are clickable. Local bindings appear in the code and References inspector, but do not clutter the global search or declaration outline and do not create caller edges. Some notation and synthetic declarations still have no compiler-recorded source destination. Source licenses are copied to `dist/SOURCE-LICENSE.txt` and `dist/LEAN-LICENSE.txt`.

Everything runs in the browser, including the search and hierarchy views. Additional library source assets are requested only when you open them; no API or external service is used. Local storage is used only for the line-wrap preference.

## Develop and verify

Edit `web/source.html`, `web/style.css`, and `web/app.js`; edit `scripts/build.py` for indexing changes. Regenerate `dist/` after editing. The generated directory is intentionally tracked so the repository is also a ready-to-host artifact.

```sh
npm ci       # installs jsdom for tests only; Node 22.13+ recommended
npm test
```

Tests validate source coverage, UTF-16 target ranges, cross-file references, graph consistency, relative assets, and DOM-level navigation behavior. They exercise definition jumps, Back/Forward with scroll restoration, hierarchy expansion, mobile view switching, search, and faithful rendering of every repository source file, local-binding navigation, generated declarations, and on-demand library definitions. These are automated index and DOM tests, not screenshots or testing on physical phones.
